import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Socket } from 'socket.io-client';
import { AuthService } from '../auth/auth.service';
import { socketManager } from '../network/socket';
import { environment } from '../../environments/environment';

interface RoomState {
  id: string;
  name: string;
  status: 'waiting' | 'countdown' | 'in_game' | 'finished';
  playerCount: number;
  minPlayers: number;
  maxPlayers: number;
  countdownSeconds: number | null;
}

@Component({
  selector: 'app-lobby',
  standalone: true,
  template: `
    <main class="lobby">
      <header>
        <div>
          <p class="eyebrow">CENTRO DE COMANDO</p>
          <h1>Lobby público</h1>
        </div>
        <div class="pilot">{{ auth.user()?.username ?? 'Invitado local' }} <button (click)="logout()">Salir</button></div>
      </header>

      <section class="actions">
        <button class="primary" (click)="quickPlay()">Jugar rápido</button>
        <button (click)="createRoom()">Crear sala</button>
      </section>

      @if (currentRoom()) {
        <section class="current">
          <p>Tu sala</p>
          <h2>{{ currentRoom()!.name }}</h2>
          <strong>{{ currentRoom()!.playerCount }}/15 jugadores</strong>
          @if (currentRoom()!.countdownSeconds !== null) {
            <span>La batalla comienza en {{ currentRoom()!.countdownSeconds }}s</span>
          } @else {
            <span>Esperando al menos 2 jugadores…</span>
          }
          <button (click)="leaveRoom()">Abandonar sala</button>
        </section>
      }

      <section class="rooms">
        <h2>Salas disponibles</h2>
        @for (room of rooms(); track room.id) {
          <article>
            <div>
              <h3>{{ room.name }}</h3>
              <span>{{ room.status }} · {{ room.playerCount }}/15</span>
            </div>
            <button (click)="joinRoom(room.id)" [disabled]="room.playerCount >= 15 || !!currentRoom()">Entrar</button>
          </article>
        } @empty {
          <p>No hay salas todavía. Jugar rápido creará la primera.</p>
        }
      </section>
      @if (error()) { <p class="error">{{ error() }}</p> }
    </main>
  `,
  styles: [`
    :host { display: block; min-height: 100vh; color: #edf4dc; background: #11170f; }
    .lobby { width: min(980px, calc(100% - 40px)); margin: auto; padding: 48px 0; }
    header { display: flex; align-items: center; justify-content: space-between; gap: 20px; }
    .eyebrow { color: #d4ff5f; letter-spacing: .2em; }
    h1 { margin: 4px 0 24px; font-size: 3rem; }
    button { padding: 11px 18px; border: 1px solid #71825c; color: #edf4dc; background: #263223; cursor: pointer; }
    button.primary { color: #10150e; background: #d4ff5f; border-color: #d4ff5f; font-weight: 800; }
    button:disabled { opacity: .4; cursor: not-allowed; }
    .actions { display: flex; gap: 12px; margin-bottom: 28px; }
    .current { display: grid; gap: 8px; padding: 24px; margin-bottom: 28px; border: 1px solid #d4ff5f; background: #1c281a; }
    .current p, .current h2 { margin: 0; }
    .current button { justify-self: start; margin-top: 10px; }
    .rooms { border-top: 1px solid #43503c; padding-top: 20px; }
    article { display: flex; justify-content: space-between; align-items: center; padding: 16px; margin: 10px 0; background: #1a2118; }
    article h3 { margin: 0 0 4px; }
    article span { color: #aeb8a6; }
    .pilot { display: flex; gap: 12px; align-items: center; }
    .error { color: #ff8a80; }
  `],
})
export class LobbyComponent implements OnInit, OnDestroy {
  readonly rooms = signal<RoomState[]>([]);
  readonly currentRoom = signal<RoomState | null>(null);
  readonly error = signal('');
  private socket!: Socket;

  constructor(
    readonly auth: AuthService,
    private readonly router: Router,
  ) {}

  ngOnInit(): void {
    this.socket = socketManager.connect(this.auth.accessToken()!);
    this.socket.on('lobby:roomsUpdated', rooms => this.rooms.set(rooms));
    this.socket.on('room:joined', room => this.currentRoom.set(room));
    this.socket.on('room:stateUpdated', room => {
      if (this.currentRoom()?.id === room.id) this.currentRoom.set(room);
    });
    this.socket.on('room:countdownStarted', room => this.currentRoom.set(room));
    this.socket.on('room:countdownUpdated', room => this.currentRoom.set(room));
    this.socket.on('room:countdownCancelled', room => this.currentRoom.set(room));
    this.socket.on('room:returnedToLobby', room => this.currentRoom.set(room));
    this.socket.on('room:left', () => this.currentRoom.set(null));
    this.socket.on('gameStarted', (data: { roomId?: string }) => {
      if (environment.devGameMode && data?.roomId) {
        const slug = data.roomId.replace(/^dev-/, '');
        void this.router.navigate(['/game', slug]);
        return;
      }
      void this.router.navigateByUrl('/game');
    });
    this.socket.on('game:error', data => this.error.set(data?.message ?? 'Error de lobby'));
    this.socket.emit('lobby:listRooms');
    this.socket.emit('room:getState');
  }

  ngOnDestroy(): void {
    this.socket?.off('lobby:roomsUpdated');
    this.socket?.off('room:joined');
    this.socket?.off('room:stateUpdated');
    this.socket?.off('room:countdownStarted');
    this.socket?.off('room:countdownUpdated');
    this.socket?.off('room:countdownCancelled');
    this.socket?.off('room:returnedToLobby');
    this.socket?.off('room:left');
    this.socket?.off('gameStarted');
    this.socket?.off('game:error');
  }

  quickPlay(): void { this.socket.emit('lobby:quickPlay'); }
  createRoom(): void { this.socket.emit('lobby:createRoom', {}); }
  joinRoom(roomId: string): void { this.socket.emit('lobby:joinRoom', { roomId }); }
  leaveRoom(): void { this.socket.emit('lobby:leaveRoom'); }

  async logout(): Promise<void> {
    socketManager.disconnect();
    await this.auth.logout();
    await this.router.navigateByUrl('/auth');
  }
}
