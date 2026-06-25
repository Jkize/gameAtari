import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { RewardsService } from './rewards.service';

@Module({
  imports: [UsersModule],
  providers: [RewardsService],
  exports: [RewardsService],
})
export class RewardsModule {}
