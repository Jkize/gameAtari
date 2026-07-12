import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { environment } from '../../environments/environment';

export const authGuard: CanActivateFn = async () => {
  if (environment.devGameMode) return true;
  const auth = inject(AuthService);
  const router = inject(Router);
  return (await auth.ensureSession()) || router.createUrlTree(['/login']);
};
