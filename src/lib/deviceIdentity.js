export function getDeviceId() {
  let id = localStorage.getItem('orbit_device_id');
  if (!id) {
    id = 'dev_' + crypto.randomUUID();
    localStorage.setItem('orbit_device_id', id);
  }
  return id;
}

export function getTabId() {
  let id = sessionStorage.getItem('orbit_tab_id');
  if (!id) {
    id = 'tab_' + crypto.randomUUID().slice(0, 8);
    sessionStorage.setItem('orbit_tab_id', id);
  }
  return id;
}

export function getPlatformInfo() {
  const ua = navigator.userAgent || '';
  let os = 'Unknown OS';
  if (/windows/i.test(ua)) os = 'Windows';
  else if (/android/i.test(ua)) os = 'Android';
  else if (/iphone|ipad|ipod/i.test(ua)) os = 'iOS';
  else if (/macintosh|mac os x/i.test(ua)) os = 'macOS';
  else if (/linux/i.test(ua)) os = 'Linux';
  else if (/cros/i.test(ua)) os = 'ChromeOS';

  let browser = 'Browser';
  if (/edg/i.test(ua)) browser = 'Edge';
  else if (/chrome/i.test(ua)) browser = 'Chrome';
  else if (/firefox/i.test(ua)) browser = 'Firefox';
  else if (/safari/i.test(ua)) browser = 'Safari';
  else if (/opera|opr/i.test(ua)) browser = 'Opera';

  const deviceType = /mobile|android|iphone/i.test(ua) ? 'mobile' : /tablet|ipad/i.test(ua) ? 'tablet' : 'desktop';
  const deviceName = `${browser} on ${os}`;
  return { os, browser, deviceType, deviceName, userAgent: ua };
}

