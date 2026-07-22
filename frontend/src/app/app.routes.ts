import { Routes } from '@angular/router';
import { EAuth } from './auth/auth.models';
import { guestGuard } from './auth/guest.guard';
import { roleGuard } from './auth/role.guard';
import { tutorialFinishedGuard, tutorialWelcomeGuard } from './auth/tutorial.guard';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./auth/login/login.component').then((module) => module.LoginComponent),
  },
  { path: 'auth', redirectTo: 'login', pathMatch: 'full' },
  {
    path: 'game',
    canActivate: [roleGuard, tutorialFinishedGuard],
    loadComponent: () =>
      import('./game/game-host.component').then((module) => module.GameHostComponent),
  },
  {
    path: 'game/:roomId',
    canActivate: [roleGuard, tutorialFinishedGuard],
    loadComponent: () =>
      import('./game/game-host.component').then((module) => module.GameHostComponent),
  },
  {
    path: 'welcome',
    canActivate: [roleGuard, tutorialWelcomeGuard],
    loadComponent: () =>
      import('./tutorial/tutorial-welcome.component').then((module) => module.TutorialWelcomeComponent),
  },
  {
    path: 'tutorial',
    canActivate: [roleGuard],
    loadComponent: () =>
      import('./tutorial/tutorial.component').then((module) => module.TutorialComponent),
  },
  {
    path: 'custom',
    canActivate: [roleGuard],
    loadComponent: () =>
      import('./map-editor/map-editor.component').then((module) => module.MapEditorComponent),
  },
  {
    path: '',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./landing/landing-page.component').then((module) => module.LandingPageComponent),
  },
  {
    path: '',
    loadComponent: () =>
      import('./layout/app-layout.component').then((module) => module.AppLayoutComponent),
    children: [
      {
        path: '',
        redirectTo: 'lobby',
        pathMatch: 'full',
      },
      {
        path: 'lobby',
        canActivate: [roleGuard, tutorialFinishedGuard],
        loadComponent: () =>
          import('./lobby/lobby.component').then((module) => module.LobbyComponent),
      },
      {
        path: 'matches/me',
        canActivate: [roleGuard],
        loadComponent: () =>
          import('./rewards/my-matches.component').then((module) => module.MyMatchesComponent),
      },
      {
        path: 'matches/recent',
        loadComponent: () =>
          import('./rewards/recent-matches.component').then(
            (module) => module.RecentMatchesComponent,
          ),
      },
      {
        path: 'users',
        canActivate: [roleGuard],
        data: { roles: [EAuth.ADMIN] },
        loadComponent: () =>
          import('./users/users-list.component').then((module) => module.UsersListComponent),
      },
      {
        path: 'stats',
        canActivate: [roleGuard],
        data: { roles: [EAuth.ADMIN] },
        loadComponent: () =>
          import('./admin-stats/admin-stats.component').then((module) => module.AdminStatsComponent),
      },
      {
        path: 'admin/stats',
        redirectTo: 'stats',
        pathMatch: 'full',
      },
      {
        path: 'matches/:matchId',
        loadComponent: () =>
          import('./rewards/match-detail.component').then((module) => module.MatchDetailComponent),
      },
    ],
  },
  { path: 'rewards/me', redirectTo: 'matches/me', pathMatch: 'full' },
  {
    path: '**',
    redirectTo: 'lobby',
  },
];
