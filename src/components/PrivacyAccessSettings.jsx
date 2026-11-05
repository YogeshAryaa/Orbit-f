import { useEffect, useState } from 'react';
import { Smartphone, Laptop, ShieldCheck, ShieldAlert, KeyRound, RefreshCw, CheckCircle2, Lock } from 'lucide-react';
import toast from 'react-hot-toast';
import { e2eeApi } from '../api/index.js';
import { errorMessage } from '../api/client.js';
import { getDeviceId } from '../lib/deviceIdentity.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function PrivacyAccessSettings() {
  const { user, reloadUser } = useAuth();
  const [devices, setDevices] = useState([]);
  const [encryptionMode, setEncryptionMode] = useState(user?.encryptionMode || 'all_devices');
  const [activity, setActivity] = useState([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const currentDeviceId = getDeviceId();

  const refresh = async () => {
    setLoading(true);
    try {
      const [devRes, backupRes, actRes] = await Promise.allSettled([
        e2eeApi.devices(),
        e2eeApi.getKeyBackup(),
        e2eeApi.securityActivity()
      ]);

      if (devRes.status === 'fulfilled') {
        const rows = devRes.value;
        setDevices(Array.isArray(rows) ? rows : rows?.devices || []);
      }
      if (backupRes.status === 'fulfilled') {
        const mode = backupRes.value?.encryptionMode || user?.encryptionMode || 'all_devices';
        setEncryptionMode(mode);
      }
      if (actRes.status === 'fulfilled') {
        const acts = actRes.value;
        setActivity(Array.isArray(acts) ? acts : acts?.events || []);
      }
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const saveMode = async (newMode) => {
    setSaving(true);
    try {
      await e2eeApi.updateEncryptionMode(newMode);
      setEncryptionMode(newMode);
      await reloadUser();
      toast.success(
        newMode === 'mobile_only'
          ? 'Mobile-Only Encryption enabled: only mobile devices can decrypt messages.'
          : 'All Devices Encryption enabled: any authorized device can decrypt messages.'
      );
      await refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const currentDevice = devices.find(d => d.deviceId === currentDeviceId);

  return (
    <section className="settings-form" style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--line)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 className="subsection-title" style={{ marginTop: 0 }}>Mobile-Wise Privacy & Encryption</h3>
          <p className="muted" style={{ margin: 0 }}>
            Encryption and decryption access is applied mobile-wise across your entire account, not per-chat.
          </p>
        </div>
        <button className="secondary-btn" onClick={refresh} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'spinning' : ''}/> Refresh
        </button>
      </div>

      {/* Multi-Device Previous Messages Sync Notice */}
      <div className="crypto-isolation-note" style={{ borderColor: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 8%, var(--panel))', color: 'var(--text)' }}>
        <CheckCircle2 size={18} style={{ color: 'var(--accent)', flexShrink: 0 }} />
        <div>
          <b style={{ color: 'var(--accent)' }}>Multi-Device History Synchronization: Active</b>
          <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--muted)', lineHeight: 1.6 }}>
            When logging in on another device with this account, all previous chats and historical messages are automatically synchronized and decryptable.
          </p>
        </div>
      </div>

      {/* Mobile-Wise Encryption Mode Selector */}
      <div style={{ background: 'var(--panel2)', border: '1px solid var(--line)', borderRadius: 14, padding: 18, marginTop: 12 }}>
        <h4 style={{ margin: '0 0 10px 0', fontSize: 13, fontWeight: 700 }}>Decryption Access Policy</h4>
        <p className="muted" style={{ fontSize: 11, marginTop: 0 }}>
          Choose which device types are permitted to decrypt and read your private conversations:
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12, marginTop: 14 }}>
          {/* Option 1: All Devices */}
          <div
            onClick={() => saveMode('all_devices')}
            style={{
              padding: 14,
              borderRadius: 12,
              cursor: saving ? 'wait' : 'pointer',
              border: `2px solid ${encryptionMode === 'all_devices' ? 'var(--accent)' : 'var(--line)'}`,
              background: encryptionMode === 'all_devices' ? 'color-mix(in srgb, var(--accent) 8%, var(--panel))' : 'var(--panel)',
              transition: 'all .2s'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <Laptop size={18} style={{ color: encryptionMode === 'all_devices' ? 'var(--accent)' : 'var(--muted)' }} />
              <b style={{ fontSize: 13 }}>All Authorized Devices</b>
              {encryptionMode === 'all_devices' && <span className="status-badge active" style={{ marginLeft: 'auto' }}>Active</span>}
            </div>
            <p className="muted" style={{ margin: 0, fontSize: 11, lineHeight: 1.5 }}>
              Any authorized mobile phone, laptop, or desktop browser logged into this account can decrypt and read all conversations.
            </p>
          </div>

          {/* Option 2: Mobile Only */}
          <div
            onClick={() => saveMode('mobile_only')}
            style={{
              padding: 14,
              borderRadius: 12,
              cursor: saving ? 'wait' : 'pointer',
              border: `2px solid ${encryptionMode === 'mobile_only' ? 'var(--accent)' : 'var(--line)'}`,
              background: encryptionMode === 'mobile_only' ? 'color-mix(in srgb, var(--accent) 8%, var(--panel))' : 'var(--panel)',
              transition: 'all .2s'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <Smartphone size={18} style={{ color: encryptionMode === 'mobile_only' ? 'var(--accent)' : 'var(--muted)' }} />
              <b style={{ fontSize: 13 }}>Mobile Devices Only</b>
              {encryptionMode === 'mobile_only' && <span className="status-badge active" style={{ marginLeft: 'auto' }}>Active</span>}
            </div>
            <p className="muted" style={{ margin: 0, fontSize: 11, lineHeight: 1.5 }}>
              Strict mobile privacy: only mobile devices (phones/tablets) can decrypt private chats. Non-mobile browsers remain locked.
            </p>
          </div>
        </div>
      </div>

      {/* Device Categorization & Decryption Status */}
      <div style={{ marginTop: 20 }}>
        <h4 style={{ margin: '0 0 10px 0', fontSize: 13, fontWeight: 700 }}>Your Devices & Decryption Status</h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {devices.map((d) => {
            const isThis = d.deviceId === currentDeviceId;
            const isMobile = d.deviceType === 'mobile';
            const canDecrypt = encryptionMode === 'all_devices' || isMobile;

            return (
              <article key={d.deviceId} className="device-row" style={{ background: 'var(--panel2)', borderRadius: 12, padding: '12px 14px', border: '1px solid var(--line)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div className="device-icon-wrap" style={{ width: 36, height: 36 }}>
                    {isMobile ? <Smartphone size={18} /> : <Laptop size={18} />}
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <b style={{ fontSize: 12 }}>{d.deviceName || (isMobile ? 'Mobile Phone' : 'Web Browser')}</b>
                      {isThis && <span className="this-device-badge">This Device</span>}
                      {d.isPrimary && <span className="status-badge active" style={{ fontSize: 9 }}>Primary</span>}
                      {isMobile ? (
                        <span className="status-badge active" style={{ fontSize: 9, background: '#17362a' }}>📱 Mobile</span>
                      ) : (
                        <span className="status-badge" style={{ fontSize: 9, background: 'var(--line)' }}>💻 Desktop</span>
                      )}
                    </div>
                    <small style={{ color: 'var(--muted)', fontSize: 10 }}>
                      {d.os} · {d.browser} · ID: <code>{d.deviceId?.slice(0, 16)}…</code>
                    </small>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
                  {canDecrypt ? (
                    <span className="status-badge active" title="Allowed to decrypt all chat history">
                      <ShieldCheck size={12} /> Can Decrypt History
                    </span>
                  ) : (
                    <span className="status-badge blocked" title="Locked by Mobile-Only privacy policy">
                      <Lock size={12} /> Decryption Locked (Desktop)
                    </span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </div>

      {/* Security Audit Activity */}
      {activity.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h4 style={{ margin: '0 0 10px 0', fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>Recent Security Events</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {activity.slice(0, 5).map(event => (
              <div key={event._id || event.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '6px 10px', background: 'var(--panel2)', borderRadius: 8 }}>
                <span>{String(event.action || 'Security event').replaceAll('_', ' ')}</span>
                <span className="muted">{event.createdAt ? new Date(event.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
