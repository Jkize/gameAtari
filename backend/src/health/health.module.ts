import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { AdminDependenciesController } from './admin-dependencies.controller';

@Module({ controllers: [HealthController, AdminDependenciesController] })
export class HealthModule {}
