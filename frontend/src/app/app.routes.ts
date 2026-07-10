import { Routes } from '@angular/router';
import { authGuard } from './auth/auth.guard';
import { guestGuard } from './auth/guest.guard';
import { rootGuard } from './auth/root.guard';

export const routes: Routes = [
  {
    path: 'auth',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./auth/auth.component').then(module => module.AuthComponent),
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
  {
    path: '',
    loadComponent: () =>
      import('./layout/app-layout.component').then(module => module.AppLayoutComponent),
    children: [
      {
        path: '',
        redirectTo: 'lobby',
        pathMatch: 'full',
      },
      {
        path: 'lobby',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./lobby/lobby.component').then(module => module.LobbyComponent),
      },
      {
        path: 'matches/me',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./rewards/my-matches.component').then(module => module.MyMatchesComponent),
      },
      {
        path: 'matches/recent',
        loadComponent: () =>
          import('./rewards/recent-matches.component').then(module => module.RecentMatchesComponent),
      },
      {
        path: 'matches/:matchId',
        loadComponent: () =>
          import('./rewards/match-detail.component').then(module => module.MatchDetailComponent),
      },
    ],
  },
  { path: 'rewards/me', redirectTo: 'matches/me', pathMatch: 'full' },
  {
    path: '**',
    redirectTo: 'lobby',
  },
];
