self.addEventListener('push', event => {
  let data = { title: 'Orbit', body: 'New notification', url: '/chat' };
  try { data = { ...data, ...event.data.json() }; } catch {}
  const isCall = data.type === 'call';
  const options = {
    body: data.body || (isCall ? 'Incoming call…' : 'You have a new message'),
    tag: isCall ? 'incoming-call' : (data.conversationId ? `msg-${data.conversationId}` : 'orbit-msg'),
    renotify: true,
    requireInteraction: isCall,
    vibrate: isCall ? [500, 250, 500, 250, 500, 250, 500] : [200, 100, 200],
    data: {
      url: data.url || '/chat',
      conversationId: data.conversationId,
      type: data.type
    }
  };
  event.waitUntil(self.registration.showNotification(data.title || 'Orbit', options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = event.notification.data?.url || '/chat';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if ('focus' in c) {
          c.navigate(target);
          return c.focus();
        }
      }
      return clients.openWindow(target);
    })
  );
});

