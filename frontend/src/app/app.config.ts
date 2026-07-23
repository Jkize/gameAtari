import { ApplicationConfig, isDevMode, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideTransloco } from '@jsverse/transloco';
import { routes } from './app.routes';
import { TranslocoHttpLoader } from '@core/i18n/transloco-loader';
import { provideServiceWorker } from '@angular/service-worker';
import { provideCharts, withDefaultRegisterables } from 'ng2-charts';
import {
  APP_LANGUAGES,
  applyDocumentLanguage,
  resolveInitialLanguage,
} from '@core/i18n/language.config';

const initialLanguage = resolveInitialLanguage();
applyDocumentLanguage(initialLanguage);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(),
    provideCharts(withDefaultRegisterables()),
    provideTransloco({
      config: {
        availableLangs: APP_LANGUAGES.map(language => language.code),
        defaultLang: initialLanguage,
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
