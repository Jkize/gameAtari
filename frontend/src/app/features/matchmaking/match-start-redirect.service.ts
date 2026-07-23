import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Socket } from 'socket.io-client';
import { environment } from '@env/environment';
import { socketManager } from '@core/realtime/socket';
import { SOCKET_EVENTS } from '@core/realtime/socket-events';

// The lobby component only navigates to /game while its route is active.
// This root service keeps the gameStarted redirect alive on any route so a
// player who wandered off during the countdown is still pulled into the match.
@Injectable({ providedIn: 'root' })
export class MatchStartRedirectService {
  private readonly router = inject(Router);

  start(): void {
    if (environment.devGameMode) return;
    socketManager.onCreated((socket) => this.attach(socket));
  }

  private attach(socket: Socket): void {
    socket.on(SOCKET_EVENTS.GAME.STARTED, () => {
      if (this.router.url.startsWith('/game')) return;
      void this.router.navigateByUrl('/game');
    });
  }
}
