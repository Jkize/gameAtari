import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('./game/game-host.component').then(module => module.GameHostComponent),
  },
  {
    path: 'custom',
    loadComponent: () =>
      import('./map-editor/map-editor.component').then(module => module.MapEditorComponent),
  },
  { path: '**', redirectTo: '' },
];
