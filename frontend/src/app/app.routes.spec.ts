import { Route } from '@angular/router';
import { roleGuard } from '@core/auth/role.guard';
import { routes } from './app.routes';

describe('match history routes', () => {
  const matchRoutes = routes
    .find(route => route.path === '' && route.children)
    ?.children ?? [];

  it.each(['matches/recent', 'matches/:matchId'])(
    'requires authentication for %s',
    path => {
      const route = matchRoutes.find(candidate => candidate.path === path) as Route;

      expect(route).toBeDefined();
      expect(route.canActivate).toContain(roleGuard);
    },
  );
});
