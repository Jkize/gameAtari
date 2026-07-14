import { BadRequestException, Body, Controller, Get, Param, Put } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthenticatedUser } from '../common/auth.types';
import { RequestUser } from '../common/request-user.decorator';
import { UpsertSettingDto } from './dto/upsert-setting.dto';
import { SettingsService } from './settings.service';

const KEY_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;
const MAX_DATA_LENGTH = 10_000;

@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get(':key')
  async get(@Param('key') key: string, @RequestUser() auth: AuthenticatedUser) {
    this.assertValidKey(key);
    const data = await this.settings.get(auth.userId, key);
    return { key, data };
  }

  @Put(':key')
  async upsert(
    @Param('key') key: string,
    @Body() dto: UpsertSettingDto,
    @RequestUser() auth: AuthenticatedUser,
  ) {
    this.assertValidKey(key);
    if (JSON.stringify(dto.data).length > MAX_DATA_LENGTH) {
      throw new BadRequestException('Settings payload is too large');
    }
    await this.settings.upsert(auth.userId, key, dto.data as Prisma.InputJsonValue);
    return { ok: true };
  }

  private assertValidKey(key: string): void {
    if (!KEY_PATTERN.test(key)) throw new BadRequestException('Invalid settings key');
  }
}
