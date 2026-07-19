import { Module } from '@nestjs/common';
import { RuntimeActivityService } from './runtime-activity.service';
import { RuntimeTelemetryService } from './runtime-telemetry.service';

@Module({
  providers: [RuntimeActivityService, RuntimeTelemetryService],
  exports: [RuntimeActivityService, RuntimeTelemetryService],
})
export class RuntimeModule {}
