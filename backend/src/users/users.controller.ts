import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { seconds, Throttle } from '@nestjs/throttler';
import { Allow } from '../auth/decorators/allow.decorator';
import { EAuth } from '../common/auth.types';
import { UsersService } from './users.service';

const MAX_CURSOR_LENGTH = 512;
const CURSOR_PATTERN = /^[A-Za-z0-9_-]+$/;

/** Admin-only user directory. Cursor-paginated, capped at 50 rows per page (see `LIST_PAGE_SIZE` in `UsersService`). */
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Allow(EAuth.ADMIN)
  @Get()
  @Throttle({ default: { limit: 60, ttl: seconds(60) } })
  list(@Query('cursor') cursor?: string) {
    this.assertValidCursor(cursor);
    return this.users.list(cursor);
  }

  private assertValidCursor(cursor?: string): void {
    if (cursor == null || cursor === '') return;
    if (cursor.length > MAX_CURSOR_LENGTH || !CURSOR_PATTERN.test(cursor)) {
      throw new BadRequestException('Invalid users cursor');
    }
  }
}
