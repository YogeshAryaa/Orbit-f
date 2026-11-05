import { useEffect, useState, useCallback } from 'react';
import {
  Smartphone,
  Laptop,
  Globe,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  History,
  MessageSquare,
  KeyRound,
  Trash2,
  RefreshCw,
  Copy,
  Check,
  Radio,
  Layers,
  AlertTriangle
} from 'lucide-react';
import toast from 'react-hot-toast';
import { formatDistanceToNow } from 'date-fns';
import { e2eeApi, conversationApi } from '../api/index.js';
import { errorMessage } from '../api/client.js';
import { getDeviceId, getTabId, getPlatformInfo } from '../lib/deviceIdentity.js';
import { getPrivateMaterial, savePrivateMaterial } from '../lib/crypto/cryptoStorage.js';
import { extractContentKey, createEnvelopeForDevice, toBase64 } from '../lib/crypto/messageEncryption.js';

export default function DeviceMessagePermissions({ user }) {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busyDeviceId, setBusyDeviceId] = useState(null);
  const [copiedId, setCopiedId] = useState('');
  const [tabs, setTabs] = useState([]);
  const [authorizingHistory, setAuthorizingHistory] = useState(false);

  const currentDeviceId = getDeviceId();
  const currentTabId = getTabId();
  const currentDeviceIsPrimary = devices.some(d => d.deviceId === currentDeviceId && d.isPrimary);
  const currentDeviceIsPending = devices.some(d => d.deviceId === currentDeviceId && d.linkStatus === 'pending');

  const loadDevices = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await e2eeApi.devices();
      const list = Array.isArray(rows) ? rows : rows?.devices || [];
      setDevices(list);

      // Register current tab
      const myDevice = list.find(d => d.deviceId === currentDeviceId);
      if (myDevice) {
        setTabs(myDevice.tabs || []);
      }
    } catch (e) {
      toast.error(`Could not load devices: ${errorMessage(e)}`);
    } finally {
      setLoading(false);
    }
  }, [currentDeviceId]);

  useEffect(() => {
    loadDevices();

    // Sync current tab
    const platform = getPlatformInfo();
    e2eeApi.syncTab({
      deviceId: currentDeviceId,
      tabId: currentTabId,
      title: document.title || 'Chat Tab',
      status: 'active'
    }).then(res => {
      if (Array.isArray(res)) setTabs(res);
    }).catch(() => {});
  }, [loadDevices, currentDeviceId, currentTabId]);

  useEffect(() => {
    if (!currentDeviceIsPending) return undefined;
    const timer = setInterval(loadDevices, 5000);
    return () => clearInterval(timer);
  }, [currentDeviceIsPending, loadDevices]);

  const copyText = (txt) => {
    navigator.clipboard?.writeText(txt);
    setCopiedId(txt);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopiedId(''), 2000);
  };

  const handlePolicyChange = async (d, policy) => {
    setBusyDeviceId(d.deviceId);
    try {
      await e2eeApi.updatePermissions(d.deviceId, { policy });
      toast.success(`Permission updated for ${d.deviceName || d.deviceId}`);
      await loadDevices();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusyDeviceId(null);
    }
  };

  const handleToggle = async (d, field, value) => {
    setBusyDeviceId(d.deviceId);
    try {
      const payload = {
        historyAllowed: field === 'history' ? value : d.historyAllowed,
        newMessagesAllowed: field === 'new' ? value : d.newMessagesAllowed
      };
      await e2eeApi.updatePermissions(d.deviceId, payload);
      toast.success(`Permissions updated for ${d.deviceName || d.deviceId}`);
      await loadDevices();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusyDeviceId(null);
    }
  };

  const handleRevoke = async (d) => {
    if (!confirm(`Revoke message access and invalidate session for ${d.deviceName || d.deviceId}?`)) return;
    setBusyDeviceId(d.deviceId);
    try {
      await e2eeApi.revokeDevice(d.deviceId);
      toast.success('Device access revoked and session terminated');
      await loadDevices();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusyDeviceId(null);
    }
  };

  const handleAuthorizeLink = async (target) => {
    const selfId = String(user?._id || user?.id || '');
    try {
      const material = await getPrivateMaterial(selfId);
      if (!material?.privateJwks?.identityPrivateKey) throw new Error('Primary-device signing key is unavailable on this device.');
      const identityKey = await crypto.subtle.importKey('jwk', material.privateJwks.identityPrivateKey, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
      const signedText = ['orbit-device-link-v1', selfId, target.deviceId, target.identityPublicKey, target.linkChallenge].join('\n');
      const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, identityKey, new TextEncoder().encode(signedText));
      await e2eeApi.authorizeLink(target.deviceId, { signature: toBase64(new Uint8Array(signature)) });
      toast.success(`Approved ${target.deviceName || target.deviceId}`);
      await loadDevices();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const handleAuthorizeHistory = async (targetDevice) => {
    setAuthorizingHistory(true);
    const toastId = toast.loading(`Authorizing historical encryption keys for ${targetDevice.deviceName}...`);
    try {
      const selfId = String(user?._id || user?.id || '');
      const material = await getPrivateMaterial(selfId);
      if (!material?.privateJwks) {
        throw new Error('This device does not possess the encryption keys to authorize history.');
      }

      // Re-wrap keys for every historical message before allowing the new device to become primary.
      const convList = await conversationApi.list();
      const conversations = Array.isArray(convList) ? convList : convList?.conversations || [];
      const bundle = { deviceId: targetDevice.deviceId, signedPreKeyPublic: targetDevice.signedPreKeyPublic };
      let envelopeBatch = [];
      let unavailableMessages = 0;
      for (const conv of conversations) {
        const conversationId = conv._id || conv.id;
        let before;
        let hasMore = true;
        while (hasMore) {
          const msgRes = await conversationApi.messages(conversationId, { limit: 100, ...(before ? { before } : {}) });
          const messages = Array.isArray(msgRes) ? msgRes : msgRes?.messages || [];
          if (!messages.length) break;
          for (const m of messages) {
            if (!m.encryptedPayload?.recipientEnvelopes?.length || m.encryptedPayload.recipientEnvelopes.some(e => e.recipientDeviceId === targetDevice.deviceId)) continue;
            try {
              const rawContentKey = await extractContentKey(m.encryptedPayload, material.privateJwks.deviceId, material.privateJwks);
              envelopeBatch.push({ messageId: m._id || m.id, envelope: await createEnvelopeForDevice(rawContentKey, bundle) });
              if (envelopeBatch.length >= 40) {
                await e2eeApi.authorizeHistory({ targetDeviceId: targetDevice.deviceId, envelopes: envelopeBatch });
                envelopeBatch = [];
              }
            } catch {
              unavailableMessages++;
            }
          }
          const oldest = messages[0]?.createdAt;
          if (messages.length < 100 || !oldest || oldest === before) hasMore = false;
          else before = oldest;
        }
      }
      if (envelopeBatch.length) await e2eeApi.authorizeHistory({ targetDeviceId: targetDevice.deviceId, envelopes: envelopeBatch });
      await savePrivateMaterial(material, selfId);
      if (unavailableMessages) throw new Error(`${unavailableMessages} encrypted messages could not be opened on this primary device, so the primary handover was stopped.`);
      await e2eeApi.authorizeHistory({ targetDeviceId: targetDevice.deviceId, envelopes: [], complete: true });

      toast.success(`Historical access authorized for ${targetDevice.deviceName}`, { id: toastId });
      await loadDevices();
    } catch (e) {
      toast.error(errorMessage(e), { id: toastId });
    } finally {
      setAuthorizingHistory(false);
    }
  };

  const handleTabStatus = async (tabId, status) => {
    try {
      await e2eeApi.updateTabStatus(currentDeviceId, tabId, { status });
      toast.success(`Tab status updated to ${status}`);
      await loadDevices();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const getStatusBadge = (d) => {
    if (d.linkStatus === 'pending') {
      return <span className="status-badge warning"><ShieldAlert size={13}/> Awaiting primary approval</span>;
    }
    if (d.status === 'revoked') {
      return <span className="status-badge revoked"><ShieldX size={13}/> Revoked</span>;
    }
    if (d.status === 'fully_blocked' || (!d.newMessagesAllowed && !d.historyAllowed)) {
      return <span className="status-badge blocked"><ShieldX size={13}/> Blocked</span>;
    }
    if (!d.historyAllowed && d.newMessagesAllowed) {
      return <span className="status-badge warning"><ShieldAlert size={13}/> New Messages Only</span>;
    }
    return <span className="status-badge active"><ShieldCheck size={13}/> Full Access</span>;
  };

  return (
    <div className="device-permissions-section">
      <div className="section-header-row">
        <div>
          <h3 className="subsection-title" style={{ marginTop: 0 }}>Message Access by Device</h3>
          <p className="muted" style={{ margin: 0 }}>
            Control which devices and browser sessions can view previous chat history or receive new messages.
          </p>
        </div>
        <button className="secondary-btn" onClick={loadDevices} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'spinning' : ''}/> Refresh
        </button>
      </div>

      {loading && !devices.length ? (
        <p className="muted">Loading registered devices…</p>
      ) : !devices.length ? (
        <p className="empty-state">No registered devices found. Open the chat screen to register this device.</p>
      ) : (
        <div className="device-card-list">
          {currentDeviceIsPending && <p className="status-badge warning">This device is waiting for approval. This page will refresh automatically.</p>}
          {devices.map((d) => {
            const isThisDevice = d.deviceId === currentDeviceId;
            const isCurrentSession = d.isCurrentSession;
            const isBlocked = d.status === 'fully_blocked' || (!d.newMessagesAllowed && !d.historyAllowed);
            const isNewOnly = !d.historyAllowed && d.newMessagesAllowed;
            const isFull = d.historyAllowed && d.newMessagesAllowed && d.status !== 'revoked';
            const isRevoked = d.status === 'revoked';

            return (
              <article key={d.deviceId} className={`device-perm-card ${isThisDevice ? 'current-device' : ''} ${isRevoked ? 'card-revoked' : ''}`}>
                <div className="device-card-header">
                  <div className="device-identity-group">
                    <div className="device-icon-wrap">
                      {d.deviceType === 'mobile' ? <Smartphone size={20}/> : <Laptop size={20}/>}
                    </div>
                    <div>
                      <div className="device-name-row">
                        <b className="device-name">{d.deviceName || 'Web Client'}</b>
                        {isThisDevice && <span className="this-device-badge">This Device</span>}
                        {isCurrentSession && <span className="current-session-badge">Current Session</span>}
                        {getStatusBadge(d)}
                      </div>
                      <div className="device-subtext">
                        <span>{d.os} · {d.browser}</span>
                        <span>·</span>
                        <span title={d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleString() : ''}>
                          Active {d.lastSeenAt ? formatDistanceToNow(new Date(d.lastSeenAt), { addSuffix: true }) : 'recently'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {currentDeviceIsPrimary && <div className="device-card-actions">
                    {!isRevoked && d.linkStatus !== 'pending' && (
                      <button className="secondary-btn small-btn" onClick={async () => {
                        const name = prompt('Name this device', d.deviceName || '');
                        if (!name?.trim()) return;
                        try {
                          await e2eeApi.renameDevice(d.deviceId, name.trim());
                          toast.success('Device renamed');
                          await loadDevices();
                        } catch (e) {
                          toast.error(errorMessage(e));
                        }
                      }}>Rename</button>
                    )}
                    {!isThisDevice && !isRevoked && d.linkStatus !== 'pending' && (
                      <button
                        className="secondary-btn small-btn danger-hover"
                        onClick={() => handleRevoke(d)}
                        disabled={busyDeviceId === d.deviceId}
                        title="Invalidate session and revoke keys"
                      >
                        <Trash2 size={13}/> Revoke
                      </button>
                    )}
                    {d.linkStatus === 'pending' && currentDeviceIsPrimary && (
                      <button className="primary-btn small-btn" onClick={() => handleAuthorizeLink(d)} disabled={busyDeviceId === d.deviceId}>
                        <ShieldCheck size={13}/> Approve link
                      </button>
                    )}
                  </div>}
                </div>

                <div className="device-id-strip">
                  <small>ID: <code>{d.deviceId}</code></small>
                  <button
                    className="icon-btn tiny-btn"
                    onClick={() => copyText(d.deviceId)}
                    title="Copy Device ID"
                  >
                    {copiedId === d.deviceId ? <Check size={12}/> : <Copy size={12}/>}
                  </button>
                  {d.sessionId && <small style={{ marginLeft: 10 }}>Session: <code>{d.sessionId.slice(0, 8)}…</code></small>}
                </div>

                {currentDeviceIsPrimary && !isRevoked && (
                  <div className="device-permission-controls">
                    <div className="permission-toggles">
                      <label className="perm-toggle-label">
                        <input
                          type="checkbox"
                          checked={d.historyAllowed}
                          disabled={!currentDeviceIsPrimary || d.isPrimary || d.linkStatus === 'pending' || busyDeviceId === d.deviceId || isRevoked}
                          onChange={(e) => handleToggle(d, 'history', e.target.checked)}
                        />
                        <span>
                          <History size={14}/> <b>Allow Message History</b>
                          <small>Can view and decrypt past messages</small>
                        </span>
                      </label>

                      <label className="perm-toggle-label">
                        <input
                          type="checkbox"
                          checked={d.newMessagesAllowed}
                          disabled={!currentDeviceIsPrimary || d.isPrimary || d.linkStatus === 'pending' || busyDeviceId === d.deviceId || isRevoked}
                          onChange={(e) => handleToggle(d, 'new', e.target.checked)}
                        />
                        <span>
                          <MessageSquare size={14}/> <b>Allow New Messages</b>
                          <small>Can receive newly sent messages</small>
                        </span>
                      </label>
                    </div>

                    <div className="permission-presets">
                      <span className="preset-label">Quick Presets:</span>
                      <button
                        className={`preset-btn ${isFull ? 'active' : ''}`}
                        onClick={() => handlePolicyChange(d, 'allow_all')}
                        disabled={!currentDeviceIsPrimary || d.isPrimary || d.linkStatus === 'pending' || busyDeviceId === d.deviceId}
                      >
                        Allow All Messages
                      </button>
                      <button
                        className={`preset-btn ${isNewOnly ? 'active' : ''}`}
                        onClick={() => handlePolicyChange(d, 'new_messages_only')}
                        disabled={!currentDeviceIsPrimary || d.isPrimary || d.linkStatus === 'pending' || busyDeviceId === d.deviceId}
                      >
                        New Messages Only
                      </button>
                      <button
                        className={`preset-btn ${isBlocked ? 'active' : ''}`}
                        onClick={() => handlePolicyChange(d, 'block')}
                        disabled={!currentDeviceIsPrimary || d.isPrimary || d.linkStatus === 'pending' || busyDeviceId === d.deviceId}
                      >
                        Block Message Access
                      </button>

                      {!isThisDevice && d.linkStatus === 'approved' && !d.historyAllowed && (
                        <button
                          className="primary-btn small-btn"
                          style={{ marginLeft: 'auto' }}
                          onClick={() => handleAuthorizeHistory(d)}
                          disabled={!currentDeviceIsPrimary || authorizingHistory}
                          title="Authorize & sync historical encryption keys from this device to target device"
                        >
                          <KeyRound size={13}/> Authorize & Sync Keys
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {/* Browser Tab Management */}
      {currentDeviceIsPrimary && <div className="tab-management-section">
        <h4 className="subsection-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Layers size={16}/> Manage Browser Tabs
        </h4>
        <p className="muted" style={{ margin: '0 0 12px 0' }}>
          Active browser tabs associated with your current session.
        </p>

        <div className="tabs-list">
          {tabs.length > 0 ? (
            tabs.map(t => {
              const isThisTab = t.tabId === currentTabId;
              return (
                <div key={t.tabId} className={`tab-row ${isThisTab ? 'current-tab-row' : ''}`}>
                  <div className="tab-info">
                    <b>{t.title || 'Chat Tab'}</b>
                    {isThisTab && <span className="this-device-badge">This Tab</span>}
                    <small>ID: <code>{t.tabId}</code> · Status: <em>{t.status || 'active'}</em></small>
                  </div>
                  <div className="tab-actions">
                    {t.status === 'restricted' ? (
                      <button className="secondary-btn small-btn" onClick={() => handleTabStatus(t.tabId, 'active')}>
                        Restore Full Access
                      </button>
                    ) : (
                      <button className="secondary-btn small-btn" onClick={() => handleTabStatus(t.tabId, 'restricted')}>
                        Restrict Tab
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="tab-row current-tab-row">
              <div className="tab-info">
                <b>Main Tab</b>
                <span className="this-device-badge">This Tab</span>
                <small>ID: <code>{currentTabId}</code> · Status: <em>active</em></small>
              </div>
            </div>
          )}
        </div>

        <div className="crypto-isolation-note">
          <AlertTriangle size={16} className="note-icon"/>
          <div>
            <b>Browser Session Architecture Note:</b>
            <p>
              Tabs sharing the same browser profile share <code>IndexedDB</code>, <code>localStorage</code>, and Service Workers.
              Tab restrictions apply in-memory socket and session controls. For true end-to-end cryptographic key separation,
              use separate browser profiles or private/incognito windows, which generate independent cryptographic device keys.
            </p>
          </div>
        </div>
      </div>}
    </div>
  );
}
