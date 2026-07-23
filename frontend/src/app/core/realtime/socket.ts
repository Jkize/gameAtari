import { io, Socket } from 'socket.io-client';
import { environment } from '@env/environment';
import { SOCKET_CONNECTION_ERROR_CODES } from './socket-events';

interface SocketAuthentication {
  accessToken(): string | undefined;
  refreshAccessToken(): Promise<string | null>;
}

type SocketConnectionError = Error & { data?: { code?: string } };

const RECOVERABLE_AUTH_ERRORS = new Set<string>([
  SOCKET_CONNECTION_ERROR_CODES.ACCESS_TOKEN_EXPIRED,
  SOCKET_CONNECTION_ERROR_CODES.AUTH_REQUIRED,
  SOCKET_CONNECTION_ERROR_CODES.AUTH_INVALID,
]);

export class SocketManager {
  private socket: Socket | null = null;
  private readonly guestId = crypto.randomUUID();
  private readonly createdCallbacks = new Set<(socket: Socket) => void>();
  private authentication?: SocketAuthentication;
  private fallbackAccessToken?: string;
  private authRecoveryPromise: Promise<void> | null = null;

  configureAuthentication(authentication: SocketAuthentication): void {
    this.authentication = authentication;
    if (this.socket) this.socket.auth = this.authPayload;
  }

  connect(accessToken?: string): Socket {
    if (accessToken !== undefined) this.fallbackAccessToken = accessToken;
    if (this.socket) {
      this.socket.auth = this.authPayload;
      if (!this.socket.active) {
        this.socket.connect();
      }
      return this.socket;
    }

    this.socket = io(environment.backendUrl, {
      auth: this.authPayload,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });
    this.socket.on('connect_error', this.onConnectError);

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
    this.socket?.off('connect_error', this.onConnectError);
    this.socket?.disconnect();
    this.socket = null;
    this.authRecoveryPromise = null;
  }

  private readonly authPayload = (callback: (payload: { token?: string; guestId: string }) => void): void => {
    callback({
      token: this.authentication?.accessToken() ?? this.fallbackAccessToken,
      guestId: this.guestId,
    });
  };

  private readonly onConnectError = (error: SocketConnectionError): void => {
    const code = error.data?.code;
    if (!code || !RECOVERABLE_AUTH_ERRORS.has(code)) return;
    void this.recoverAuthentication();
  };

  private async recoverAuthentication(): Promise<void> {
    if (!this.authentication) return;
    if (this.authRecoveryPromise) return this.authRecoveryPromise;
    this.authRecoveryPromise = (async () => {
      const accessToken = await this.authentication!.refreshAccessToken().catch(() => null);
      if (!accessToken || !this.socket) return;
      this.fallbackAccessToken = accessToken;
      this.socket.auth = this.authPayload;
      if (!this.socket.active) this.socket.connect();
    })().finally(() => {
      this.authRecoveryPromise = null;
    });
    return this.authRecoveryPromise;
  }

}

export const socketManager = new SocketManager();
