import { Routes } from '@angular/router';
import { EAuth } from '@core/auth/auth.models';
import { guestGuard } from '@core/auth/guest.guard';
import { roleGuard } from '@core/auth/role.guard';
import { tutorialFinishedGuard, tutorialWelcomeGuard } from '@core/auth/tutorial.guard';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('@pages/login/login.component').then((module) => module.LoginComponent),
  },
  { path: 'auth', redirectTo: 'login', pathMatch: 'full' },
  {
    path: 'game',
    canActivate: [roleGuard, tutorialFinishedGuard],
    loadComponent: () =>
      import('@pages/game/game-host.component').then((module) => module.GameHostComponent),
  },
  {
    path: 'game/:roomId',
    canActivate: [roleGuard, tutorialFinishedGuard],
    loadComponent: () =>
      import('@pages/game/game-host.component').then((module) => module.GameHostComponent),
  },
  {
    path: 'welcome',
    canActivate: [roleGuard, tutorialWelcomeGuard],
    loadComponent: () =>
      import('@pages/tutorial/tutorial-welcome/tutorial-welcome.component').then((module) => module.TutorialWelcomeComponent),
  },
  {
    path: 'tutorial',
    canActivate: [roleGuard],
    loadComponent: () =>
      import('@pages/tutorial/tutorial/tutorial.component').then((module) => module.TutorialComponent),
  },
  {
    path: 'custom',
    canActivate: [roleGuard],
    loadComponent: () =>
      import('@pages/map-editor/map-editor/map-editor.component').then((module) => module.MapEditorComponent),
  },
  {
    path: '',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('@pages/landing/landing-page.component').then((module) => module.LandingPageComponent),
  },
  {
    path: '',
    loadComponent: () =>
      import('@app/layout/app-layout/app-layout.component').then((module) => module.AppLayoutComponent),
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
          import('@pages/lobby/lobby/lobby.component').then((module) => module.LobbyComponent),
      },
      {
        path: 'matches/me',
        canActivate: [roleGuard],
        loadComponent: () =>
          import('@pages/matches/my-matches/my-matches.component').then((module) => module.MyMatchesComponent),
      },
      {
        path: 'matches/recent',
        loadComponent: () =>
          import('@pages/matches/recent-matches/recent-matches.component').then(
            (module) => module.RecentMatchesComponent,
          ),
      },
      {
        path: 'users',
        canActivate: [roleGuard],
        data: { roles: [EAuth.ADMIN] },
        loadComponent: () =>
          import('@pages/admin/users/users-list/users-list.component').then((module) => module.UsersListComponent),
      },
      {
        path: 'stats',
        canActivate: [roleGuard],
        data: { roles: [EAuth.ADMIN] },
        loadComponent: () =>
          import('@pages/admin/stats/admin-stats/admin-stats.component').then((module) => module.AdminStatsComponent),
      },
      {
        path: 'admin/stats',
        redirectTo: 'stats',
        pathMatch: 'full',
      },
      {
        path: 'matches/:matchId',
        loadComponent: () =>
          import('@pages/matches/match-detail/match-detail.component').then((module) => module.MatchDetailComponent),
      },
    ],
  },
  { path: 'rewards/me', redirectTo: 'matches/me', pathMatch: 'full' },
  {
    path: '**',
    redirectTo: 'lobby',
  },
];
