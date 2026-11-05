import { useState, useEffect } from 'react';
import { Bell, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext.jsx';
import { isPushSupported, requestPushPermission } from '../lib/pushNotifications.js';

export default function NotificationBanner() {
  const { user } = useAuth();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user || !isPushSupported()) return;
    const dismissed = sessionStorage.getItem('orbit-notif-dismissed');
    if (!dismissed && Notification.permission === 'default') {
      setShow(true);
    }
  }, [user]);

  if (!show) return null;

  const handleEnable = async () => {
    setBusy(true);
    try {
      await requestPushPermission(user);
      setShow(false);
      toast.success('Notifications enabled! You will now receive call alerts.');
    } catch (err) {
      toast.error(err?.message || 'Could not enable notifications');
    } finally {
      setBusy(false);
    }
  };

  const handleDismiss = () => {
    setShow(false);
    sessionStorage.setItem('orbit-notif-dismissed', 'true');
  };

  return (
    <div style={{
      position: 'fixed',
      top: 12,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 9999,
      width: 'min(92vw, 460px)',
      background: 'var(--panel, #18181b)',
      border: '1px solid var(--accent, #10b981)',
      borderRadius: '12px',
      padding: '12px 14px',
      boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
      display: 'flex',
      alignItems: 'center',
      gap: 12
    }}>
      <div style={{
        width: 36,
        height: 36,
        borderRadius: '50%',
        background: 'rgba(16, 185, 129, 0.15)',
        display: 'grid',
        placeItems: 'center',
        flexShrink: 0,
        color: 'var(--accent, #10b981)'
      }}>
        <Bell size={18}/>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <b style={{ display: 'block', fontSize: 13, color: 'var(--text, #fff)' }}>Enable call & message alerts</b>
        <small style={{ display: 'block', fontSize: 11, color: 'var(--muted, #a1a1aa)', marginTop: 2 }}>
          Get incoming call ringtones and alerts on this device.
        </small>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <button
          className="primary-btn small"
          style={{ padding: '6px 12px', fontSize: 12 }}
          onClick={handleEnable}
          disabled={busy}
        >
          {busy ? 'Enabling…' : 'Enable'}
        </button>
        <button
          className="icon-btn"
          style={{ width: 28, height: 28 }}
          onClick={handleDismiss}
          title="Dismiss"
        >
          <X size={15}/>
        </button>
      </div>
    </div>
  );
}

