import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { RedisService } from './redis/redis.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const redis = app.get(RedisService);
  await redis.ensureConnected();
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors({
    origin: config.get<string>('FRONTEND_ORIGIN', 'http://localhost:4200').split(','),
    credentials: true,
  });
  app.enableShutdownHooks();
  const port = config.get<number>('PORT', 3000);
  await app.listen(port);
  console.log(`Game backend running on http://localhost:${port}`);
  if (config.get<boolean>('DEV_GAME_MODE', false)) {
    console.warn('[DEV GAME MODE] Authentication and persistent infrastructure are bypassed.');
  }
}

bootstrap();
