import { SetMetadata } from '@nestjs/common';
import { EAuth } from '../../common/auth.types';

export const ALLOW_ROLES_KEY = 'allowRoles';

export const Allow = (...roles: EAuth[]) => SetMetadata(ALLOW_ROLES_KEY, roles);
