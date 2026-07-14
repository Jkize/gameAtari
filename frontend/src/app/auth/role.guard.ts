import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router } from '@angular/router';
import { environment } from '../../environments/environment';
import { EAuth } from './auth.models';
import { AuthService } from './auth.service';

export const roleGuard: CanActivateFn = async (route: ActivatedRouteSnapshot) => {
  if (environment.devGameMode) return true;
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!(await auth.ensureSession())) return router.createUrlTree(['/login']);
  const requiredRoles = (route.data?.['roles'] as EAuth[] | undefined) ?? [EAuth.USER];
  if (auth.isAdmin() || requiredRoles.includes(auth.role())) return true;
  return router.createUrlTree(['/lobby']);
};
