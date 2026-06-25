import { io, Socket } from 'socket.io-client';
import { environment } from '../../environments/environment';

class SocketManager {
  private socket: Socket | null = null;
  private readonly guestId = crypto.randomUUID();

  connect(accessToken?: string): Socket {
    if (this.socket) {
      this.socket.auth = { token: accessToken, guestId: this.guestId };
      if (!this.socket.active) {
        this.socket.connect();
      }
      return this.socket;
    }

    this.socket = io(environment.backendUrl, {
      auth: { token: accessToken, guestId: this.guestId },
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    return this.socket;
  }

  get(): Socket | null {
    return this.socket;
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
  }

}

export const socketManager = new SocketManager();
