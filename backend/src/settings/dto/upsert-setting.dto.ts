import { IsObject } from 'class-validator';

export class UpsertSettingDto {
  @IsObject()
  data!: Record<string, unknown>;
}
