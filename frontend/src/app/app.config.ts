import { ApplicationConfig, isDevMode, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideTransloco } from '@jsverse/transloco';
import { routes } from './app.routes';
import { TranslocoHttpLoader } from './transloco-loader';
import { provideServiceWorker } from '@angular/service-worker';

const storedLang = typeof localStorage !== 'undefined'
  ? (localStorage.getItem('tank-arena:lang') ?? 'en')
  : 'en';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(),
    provideTransloco({
      config: {
        availableLangs: ['en', 'es'],
        defaultLang: storedLang,
        reRenderOnLangChange: true,
        prodMode: !isDevMode(),
      },
      loader: TranslocoHttpLoader,
    }), provideServiceWorker('ngsw-worker.js', {
            enabled: !isDevMode(),
            registrationStrategy: 'registerWhenStable:30000'
          }),
  ]
};
