import { Global, Module } from '@nestjs/common';
import { DevelopmentSettingsService } from './development-settings.service';

@Global()
@Module({
  providers: [DevelopmentSettingsService],
  exports: [DevelopmentSettingsService],
})
export class DevelopmentSettingsModule {}
