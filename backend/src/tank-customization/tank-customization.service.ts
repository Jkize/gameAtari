import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { isDeepStrictEqual } from 'util';
import { PrismaService } from '../prisma/prisma.service';
import {
  TANK_CUSTOMIZATION_SETTING_KEY,
  TankCustomization,
  TankPaintPatch,
  canonicalizeStoredTankCustomization,
  createStoredTankCustomization,
  mergeTankPaint,
  resolveTankCustomization,
  stableLegacyBaseColor,
} from './tank-customization.types';

@Injectable()
export class TankCustomizationService {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string): Promise<TankCustomization> {
    const fallback = stableLegacyBaseColor(userId);
    const row = await this.prisma.userSetting.findUnique({
      where: { userId_key: { userId, key: TANK_CUSTOMIZATION_SETTING_KEY } },
    });
    const resolved = resolveTankCustomization(row?.data, fallback);
    const canonical = canonicalizeStoredTankCustomization(row?.data, fallback);
    if (!row || !isDeepStrictEqual(row.data, canonical)) {
      await this.prisma.userSetting.upsert({
        where: { userId_key: { userId, key: TANK_CUSTOMIZATION_SETTING_KEY } },
        create: {
          userId,
          key: TANK_CUSTOMIZATION_SETTING_KEY,
          data: createStoredTankCustomization(fallback) as Prisma.InputJsonValue,
        },
        update: {
          data: canonical as Prisma.InputJsonValue,
        },
      });
    }
    return resolved;
  }

  async getMany(userIds: string[]): Promise<Record<string, TankCustomization>> {
    const uniqueIds = [...new Set(userIds)];
    const rows = await this.prisma.userSetting.findMany({
      where: { userId: { in: uniqueIds }, key: TANK_CUSTOMIZATION_SETTING_KEY },
    });
    const byUserId = new Map(rows.map(row => [row.userId, row.data]));
    const result: Record<string, TankCustomization> = {};
    for (const userId of uniqueIds) {
      const fallback = stableLegacyBaseColor(userId);
      result[userId] = resolveTankCustomization(byUserId.get(userId), fallback);
    }
    return result;
  }

  async updatePaint(
    userId: string,
    paint: TankPaintPatch,
  ): Promise<TankCustomization> {
    this.assertPaintPatch(paint);
    await this.get(userId);
    const row = await this.prisma.userSetting.findUniqueOrThrow({
      where: { userId_key: { userId, key: TANK_CUSTOMIZATION_SETTING_KEY } },
    });
    const fallback = stableLegacyBaseColor(userId);
    const data = mergeTankPaint(row.data, paint, fallback);
    await this.prisma.userSetting.update({
      where: { userId_key: { userId, key: TANK_CUSTOMIZATION_SETTING_KEY } },
      data: { data: data as Prisma.InputJsonValue },
    });
    return resolveTankCustomization(data, fallback);
  }

  private assertPaintPatch(paint: unknown): asserts paint is TankPaintPatch {
    if (!paint || typeof paint !== 'object' || Array.isArray(paint)) {
      throw new BadRequestException('paint must be an object');
    }
    const allowedGroups = ['hull', 'turret', 'tracks'];
    for (const group of Object.keys(paint)) {
      if (!allowedGroups.includes(group)) {
        throw new BadRequestException(`Unknown tank paint group: ${group}`);
      }
    }
    this.assertGroup(paint, 'hull', ['base']);
    this.assertGroup(paint, 'turret', ['base']);
    this.assertGroup(paint, 'tracks', ['treadShadow']);
  }

  private assertGroup(
    paint: object,
    groupName: string,
    allowedProperties: string[],
  ): void {
    const group = (paint as Record<string, unknown>)[groupName];
    if (group === undefined) return;
    if (!group || typeof group !== 'object' || Array.isArray(group)) {
      throw new BadRequestException(`${groupName} must be an object`);
    }
    for (const [property, color] of Object.entries(group)) {
      if (!allowedProperties.includes(property)) {
        throw new BadRequestException(`Unknown tank paint property: ${groupName}.${property}`);
      }
      if (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color)) {
        throw new BadRequestException(`Invalid tank paint color for ${groupName}.${property}`);
      }
    }
  }
}
