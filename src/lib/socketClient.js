import { io } from 'socket.io-client';
import { getDeviceId, getTabId } from './deviceIdentity.js';

export const socket = io(import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000', {
  autoConnect: false,
  transports: ['websocket', 'polling'],
  auth: cb => cb({
    token: sessionStorage.getItem('orbit_chat_token'),
    deviceId: getDeviceId(),
    tabId: getTabId()
  })
});