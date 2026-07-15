import { io, Socket } from 'socket.io-client';
import { environment } from '../../environments/environment';

class SocketManager {
  private socket: Socket | null = null;
  private readonly guestId = crypto.randomUUID();
  private readonly createdCallbacks = new Set<(socket: Socket) => void>();

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

    for (const callback of this.createdCallbacks) callback(this.socket);

    return this.socket;
  }

  // Runs once per socket instance, so route-independent listeners survive
  // component destruction and full disconnect/reconnect cycles.
  onCreated(callback: (socket: Socket) => void): void {
    this.createdCallbacks.add(callback);
    if (this.socket) callback(this.socket);
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
