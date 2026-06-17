import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: '*' });
  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`Game backend running on http://localhost:${port}`);
}

bootstrap();
