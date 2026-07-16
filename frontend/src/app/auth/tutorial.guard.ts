import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

export const tutorialFinishedGuard: CanActivateFn = async () => {
  if (environment.devGameMode) return true;
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!(await auth.ensureSession())) return router.createUrlTree(['/login']);
  return auth.tutorialPending() ? router.createUrlTree(['/welcome']) : true;
};

export const tutorialWelcomeGuard: CanActivateFn = async () => {
  if (environment.devGameMode) return true;
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!(await auth.ensureSession())) return router.createUrlTree(['/login']);
  return auth.tutorialPending() ? true : router.createUrlTree(['/lobby']);
};
