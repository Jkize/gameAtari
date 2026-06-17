import { Module } from '@nestjs/common';
import { GameModule } from './games/tanks/game.module';

@Module({
  imports: [GameModule],
})
export class AppModule {}
