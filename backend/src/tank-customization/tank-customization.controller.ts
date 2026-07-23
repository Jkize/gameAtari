import { Body, Controller, Get, Patch } from '@nestjs/common';
import { AuthenticatedUser } from '../common/auth.types';
import { RequestUser } from '../common/request-user.decorator';
import { TankPaintPatch } from './tank-customization.types';
import { TankCustomizationService } from './tank-customization.service';

@Controller('tank-customization')
export class TankCustomizationController {
  constructor(private readonly customization: TankCustomizationService) {}

  @Get()
  get(@RequestUser() auth: AuthenticatedUser) {
    return this.customization.get(auth.userId);
  }

  @Patch()
  update(
    @RequestUser() auth: AuthenticatedUser,
    @Body() body: { paint?: TankPaintPatch },
  ) {
    return this.customization.updatePaint(auth.userId, body?.paint as never);
  }
}
