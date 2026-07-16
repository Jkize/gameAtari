import { Module } from '@nestjs/common';
import { TutorialController } from './tutorial.controller';
import { UsersService } from './users.service';

@Module({
  controllers: [TutorialController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
