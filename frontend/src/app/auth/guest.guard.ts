import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

export const guestGuard: CanActivateFn = async () => {
  const router = inject(Router);
  if (environment.devGameMode) {
    return router.createUrlTree(['/game', 'salatest']);
  }

  const auth = inject(AuthService);
  const authenticated = await auth.ensureSession();
  return authenticated ? router.createUrlTree(['/lobby']) : true;
};
