import { io } from "socket.io-client";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:8000";

let socket = null;

export const getSocket = () => socket;

export const connectSocket = (token) => {
  if (socket) {
    if (!socket.connected) {
      socket.auth = { token };
      socket.connect();
    }
    return socket;
  }

  socket = io(SOCKET_URL, {
    auth: { token },
    transports: ["websocket", "polling"],
  });

  return socket;
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};

export default { getSocket, connectSocket, disconnectSocket };
