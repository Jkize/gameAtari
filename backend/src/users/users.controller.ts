import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { seconds, Throttle } from '@nestjs/throttler';
import { Allow } from '../auth/decorators/allow.decorator';
import { EAuth } from '../common/auth.types';
import { SortOrder, USER_SORT_FIELDS, UserSortField, UsersService } from './users.service';

const MAX_CURSOR_LENGTH = 512;
const CURSOR_PATTERN = /^[A-Za-z0-9_-]+$/;
const SORT_ORDERS: readonly SortOrder[] = ['asc', 'desc'];

/** Admin-only user directory. Cursor-paginated, capped at 50 rows per page (see `LIST_PAGE_SIZE` in `UsersService`). */
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Allow(EAuth.ADMIN)
  @Get()
  @Throttle({ default: { limit: 60, ttl: seconds(60) } })
  list(
    @Query('cursor') cursor?: string,
    @Query('sortBy') sortBy?: string,
    @Query('order') order?: string,
  ) {
    this.assertValidCursor(cursor);
    const validSortBy = this.assertValidSortBy(sortBy);
    const validOrder = this.assertValidOrder(order);
    return this.users.list(cursor, validSortBy, validOrder);
  }

  private assertValidCursor(cursor?: string): void {
    if (cursor == null || cursor === '') return;
    if (cursor.length > MAX_CURSOR_LENGTH || !CURSOR_PATTERN.test(cursor)) {
      throw new BadRequestException('Invalid users cursor');
    }
  }

  private assertValidSortBy(sortBy?: string): UserSortField {
    if (sortBy == null || sortBy === '') return 'createdAt';
    if (!USER_SORT_FIELDS.includes(sortBy as UserSortField)) {
      throw new BadRequestException('Invalid users sortBy');
    }
    return sortBy as UserSortField;
  }

  private assertValidOrder(order?: string): SortOrder {
    if (order == null || order === '') return 'desc';
    if (!SORT_ORDERS.includes(order as SortOrder)) {
      throw new BadRequestException('Invalid users order');
    }
    return order as SortOrder;
  }
}
