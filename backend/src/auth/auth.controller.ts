import {
  Body,
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { seconds, Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { RequestUser } from '../common/request-user.decorator';
import { AuthenticatedUser } from '../common/auth.types';
import { UsersService } from '../users/users.service';
import { AccessTokenGuard } from './access-token.guard';
import { CompleteProfileDto, GoogleLoginDto, PhantomChallengeDto, PhantomVerifyDto } from './dto/auth.dto';
import { GoogleAuthService } from './google-auth.service';
import { PhantomAuthService } from './phantom-auth.service';
import { RefreshCookieDescriptor, TokensService } from './tokens.service';

const MAX_AUTHORIZATION_HEADER_LENGTH = 4_096;
const MAX_REFRESH_COOKIE_LENGTH = 4_096;

@Controller('auth')
export class AuthController {
  constructor(
    private readonly google: GoogleAuthService,
    private readonly phantom: PhantomAuthService,
    private readonly tokens: TokensService,
    private readonly users: UsersService,
    private readonly config: ConfigService,
  ) {}

  @Post('google')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: seconds(60) } })
  async loginGoogle(@Body() dto: GoogleLoginDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.google.login(dto.idToken);
    return this.withRefreshCookie(res, result);
  }

  @Post('phantom/challenge')
  @Throttle({ default: { limit: 10, ttl: seconds(60) } })
  async phantomChallenge(@Body() dto: PhantomChallengeDto) {
    return this.phantom.challenge(dto.publicKey);
  }

  @Post('phantom/verify')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: seconds(60) } })
  async phantomVerify(@Body() dto: PhantomVerifyDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.phantom.verify(dto.publicKey, dto.message, dto.signature);
    return this.withRefreshCookie(res, result);
  }

  @Post('complete-profile')
  @Throttle({ default: { limit: 10, ttl: seconds(60) } })
  async completeProfile(
    @Body() dto: CompleteProfileDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const bearer = req.headers.authorization;
    if (!bearer?.startsWith('Bearer ')) throw new UnauthorizedException('Missing onboarding token');
    this.assertMaxLength(bearer, MAX_AUTHORIZATION_HEADER_LENGTH, 'Authorization header');
    const payload = await this.tokens.verifyOnboarding(bearer.slice(7));
    const user = await this.users.setUsername(payload.sub, dto.username);
    const result = await this.tokens.issueSession(user, payload.provider);
    this.setRefreshCookie(res, result.refreshCookie);
    return { accessToken: result.accessToken, user };
  }

  @Post('refresh')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: seconds(60) } })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const raw = req.cookies?.tank_refresh;
    if (!raw) throw new UnauthorizedException('Missing refresh token');
    this.assertMaxLength(raw, MAX_REFRESH_COOKIE_LENGTH, 'Refresh token');
    const result = await this.tokens.rotate(raw);
    this.setRefreshCookie(res, result.refreshCookie);
    return { accessToken: result.accessToken };
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const raw = req.cookies?.tank_refresh as string | undefined;
    if (raw) this.assertMaxLength(raw, MAX_REFRESH_COOKIE_LENGTH, 'Refresh token');
    const sessionId = raw?.split('.')[0];
    if (sessionId) await this.tokens.revoke(sessionId);
    res.clearCookie('tank_refresh', this.cookieOptions());
    return { ok: true };
  }

  @Get('me')
  @UseGuards(AccessTokenGuard)
  async me(@RequestUser() auth: AuthenticatedUser) {
    return this.users.requireById(auth.userId);
  }

  private withRefreshCookie(
    res: Response,
    result: { refreshCookie?: RefreshCookieDescriptor; [key: string]: unknown },
  ) {
    if (result.refreshCookie) this.setRefreshCookie(res, result.refreshCookie);
    const { refreshCookie: _refreshCookie, ...body } = result;
    return body;
  }

  private setRefreshCookie(res: Response, descriptor: RefreshCookieDescriptor): void {
    res.cookie('tank_refresh', descriptor.value, {
      ...this.cookieOptions(),
      maxAge: descriptor.maxAge,
    });
  }

  private cookieOptions() {
    const production = this.config.get<string>('NODE_ENV') === 'production';
    return {
      httpOnly: true,
      secure: production,
      sameSite: production ? ('none' as const) : ('lax' as const),
      path: '/auth',
    };
  }

  private assertMaxLength(value: string, maxLength: number, label: string): void {
    if (value.length > maxLength) {
      throw new BadRequestException(`${label} is too large`);
    }
  }
}
