import { io, Socket } from "socket.io-client";
import { API_BASE_URL } from "./api/client";

let socket: Socket | null = null;
let socketToken: string | null = null;

/**
 * One shared socket for the whole app. If the logged-in user changes (new
 * token) the old connection is dropped so we never keep talking as the
 * previous user.
 */
export const getSocket = (token: string): Socket => {
  if (socket && socketToken !== token) {
    socket.disconnect();
    socket = null;
  }
  if (!socket) {
    socketToken = token;
    socket = io(API_BASE_URL, {
      auth: { token },
      transports: ["websocket"],
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 3000,
    });
  }
  return socket;
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
    socketToken = null;
  }
};
