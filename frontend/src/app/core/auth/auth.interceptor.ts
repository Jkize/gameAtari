import {
  HttpErrorResponse,
  HttpInterceptorFn,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { environment } from '@env/environment';
import { AuthService } from './auth.service';

const BACKEND_URL = environment.backendUrl.replace(/\/$/, '');
const AUTH_URL_PREFIX = `${BACKEND_URL}/auth/`;

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const isBackendRequest = request.url === BACKEND_URL || request.url.startsWith(`${BACKEND_URL}/`);
  const isAuthRequest = request.url.startsWith(AUTH_URL_PREFIX);
  const accessToken = auth.accessToken();
  const authenticatedRequest = isBackendRequest
    && !isAuthRequest
    && accessToken
    && !request.headers.has('Authorization')
    ? request.clone({ setHeaders: { Authorization: `Bearer ${accessToken}` } })
    : request;

  return next(authenticatedRequest).pipe(
    catchError(error => {
      if (
        !(error instanceof HttpErrorResponse)
        || error.status !== 401
        || !isBackendRequest
        || isAuthRequest
      ) {
        return throwError(() => error);
      }

      const latestToken = auth.accessToken();
      const failedAuthorization = authenticatedRequest.headers.get('Authorization');
      if (latestToken && failedAuthorization && failedAuthorization !== `Bearer ${latestToken}`) {
        return next(request.clone({
          setHeaders: { Authorization: `Bearer ${latestToken}` },
        }));
      }

      return from(auth.ensureSession(true)).pipe(
        switchMap(restored => {
          const refreshedToken = auth.accessToken();
          if (!restored || !refreshedToken) return throwError(() => error);

          return next(request.clone({
            setHeaders: { Authorization: `Bearer ${refreshedToken}` },
          }));
        }),
      );
    }),
  );
};
