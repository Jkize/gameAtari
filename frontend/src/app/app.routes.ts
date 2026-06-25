import { Routes } from '@angular/router';
import { authGuard } from './auth/auth.guard';
import { environment } from '../environments/environment';
import { guestGuard } from './auth/guest.guard';

export const routes: Routes = [
  {
    path: 'auth',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./auth/auth.component').then(module => module.AuthComponent),
  },
  {
    path: 'lobby',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./lobby/lobby.component').then(module => module.LobbyComponent),
  },
  {
    path: 'game',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./game/game-host.component').then(module => module.GameHostComponent),
  },
  {
    path: 'game/:roomId',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./game/game-host.component').then(module => module.GameHostComponent),
  },
  {
    path: 'custom',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./map-editor/map-editor.component').then(module => module.MapEditorComponent),
  },
  { path: '', pathMatch: 'full', redirectTo: environment.devGameMode ? 'game/salatest' : 'auth' },
  { path: '**', redirectTo: environment.devGameMode ? 'game/salatest' : 'auth' },
];
