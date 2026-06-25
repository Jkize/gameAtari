import {
  Body,
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
import { AuthProvider } from '@prisma/client';
import { Request, Response } from 'express';
import { RequestUser } from '../common/request-user.decorator';
import { AuthenticatedUser } from '../common/auth.types';
import { UsersService } from '../users/users.service';
import { AccessTokenGuard } from './access-token.guard';
import { CompleteProfileDto, GoogleLoginDto, PhantomChallengeDto, PhantomVerifyDto } from './dto/auth.dto';
import { GoogleAuthService } from './google-auth.service';
import { PhantomAuthService } from './phantom-auth.service';
import { AuthRateLimitService } from './rate-limit.service';
import { RefreshCookieDescriptor, TokensService } from './tokens.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly google: GoogleAuthService,
    private readonly phantom: PhantomAuthService,
    private readonly tokens: TokensService,
    private readonly users: UsersService,
    private readonly rateLimit: AuthRateLimitService,
    private readonly config: ConfigService,
  ) {}

  @Post('google')
  @HttpCode(200)
  async loginGoogle(@Body() dto: GoogleLoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.rateLimit.consume('google', req.ip ?? 'unknown', 10, 60);
    const result = await this.google.login(dto.idToken);
    return this.withRefreshCookie(res, result);
  }

  @Post('phantom/challenge')
  async phantomChallenge(@Body() dto: PhantomChallengeDto, @Req() req: Request) {
    await this.rateLimit.consume('phantom-challenge', req.ip ?? 'unknown', 10, 60);
    return this.phantom.challenge(dto.publicKey);
  }

  @Post('phantom/verify')
  @HttpCode(200)
  async phantomVerify(@Body() dto: PhantomVerifyDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.rateLimit.consume('phantom-verify', req.ip ?? 'unknown', 10, 60);
    const result = await this.phantom.verify(dto.publicKey, dto.message, dto.signature);
    return this.withRefreshCookie(res, result);
  }

  @Post('complete-profile')
  async completeProfile(
    @Body() dto: CompleteProfileDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const bearer = req.headers.authorization;
    if (!bearer?.startsWith('Bearer ')) throw new UnauthorizedException('Missing onboarding token');
    const payload = await this.tokens.verifyOnboarding(bearer.slice(7));
    const user = await this.users.setUsername(payload.sub, dto.username);
    const result = await this.tokens.issueSession(user, payload.provider);
    this.setRefreshCookie(res, result.refreshCookie);
    return { accessToken: result.accessToken, user };
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.rateLimit.consume('refresh', req.ip ?? 'unknown', 30, 60);
    const raw = req.cookies?.tank_refresh;
    if (!raw) throw new UnauthorizedException('Missing refresh token');
    const result = await this.tokens.rotate(raw);
    this.setRefreshCookie(res, result.refreshCookie);
    return { accessToken: result.accessToken };
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const raw = req.cookies?.tank_refresh as string | undefined;
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
}
