import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';

let socket = null;
/** Stable id for the singleton socket wrapper — proves connect/join/on/emit use same instance */
let socketInstanceSeq = 0;
let activeSocketInstanceId = null;

export const getSocket = () => socket;

export const getSocketInstanceId = () => activeSocketInstanceId;

export const connectSocket = (token) => {
  if (socket) {
    socket.auth = { token };
    console.log('[SOCKET AUDIT] connectSocket REUSE', {
      socketInstanceId: activeSocketInstanceId,
      socketId: socket.id ?? null,
      connected: socket.connected,
      url: SOCKET_URL,
    });
    if (!socket.connected) {
      socket.connect();
    }
    return socket;
  }

  activeSocketInstanceId = `sock-${++socketInstanceSeq}-${Date.now()}`;
  socket = io(SOCKET_URL, {
    auth: { token },
    transports: ['websocket'],
    autoConnect: false,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
  });

  console.log('[SOCKET AUDIT] connectSocket CREATE', {
    socketInstanceId: activeSocketInstanceId,
    url: SOCKET_URL,
  });

  socket.connect();

  socket.on('connect', () => {
    console.log('[SOCKET AUDIT] socket connected', {
      socketInstanceId: activeSocketInstanceId,
      socketId: socket.id,
      url: SOCKET_URL,
    });
  });

  socket.on('disconnect', (reason) => {
    console.log('[SOCKET AUDIT] socket disconnected', {
      socketInstanceId: activeSocketInstanceId,
      socketId: socket.id,
      reason,
    });
  });

  return socket;
};

export const disconnectSocket = () => {
  if (socket) {
    console.warn('[SOCKET AUDIT] disconnectSocket — ALL listeners removed', {
      socketInstanceId: activeSocketInstanceId,
      socketId: socket.id,
    });
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
    activeSocketInstanceId = null;
  }
};

export default {
  getSocket,
  connectSocket,
  disconnectSocket,
};