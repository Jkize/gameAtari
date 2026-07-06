import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string, key: string): Promise<Prisma.JsonValue | null> {
    const row = await this.prisma.userSetting.findUnique({
      where: { userId_key: { userId, key } },
    });
    return row?.data ?? null;
  }

  async upsert(userId: string, key: string, data: Prisma.InputJsonValue): Promise<void> {
    await this.prisma.userSetting.upsert({
      where: { userId_key: { userId, key } },
      create: { userId, key, data },
      update: { data },
    });
  }
}
