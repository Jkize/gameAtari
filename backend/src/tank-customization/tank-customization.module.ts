import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TankCustomizationController } from './tank-customization.controller';
import { TankCustomizationService } from './tank-customization.service';

@Module({
  imports: [AuthModule],
  controllers: [TankCustomizationController],
  providers: [TankCustomizationService],
  exports: [TankCustomizationService],
})
export class TankCustomizationModule {}
