import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthProvider } from '@prisma/client';
import bs58 from 'bs58';
import { createHash, randomBytes } from 'crypto';
import nacl from 'tweetnacl';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { UsersService } from '../users/users.service';
import { TokensService } from './tokens.service';

@Injectable()
export class PhantomAuthService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly users: UsersService,
    private readonly tokens: TokensService,
  ) {}

  async challenge(publicKey: string) {
    this.decodePublicKey(publicKey);
    const nonce = randomBytes(16).toString('hex');
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + 2 * 60 * 1000);
    const domain = this.config.getOrThrow<string>('AUTH_PRIMARY_DOMAIN');
    const uri = this.config.getOrThrow<string>('AUTH_PRIMARY_URI');
    const message = [
      `${domain} wants you to sign in with your Solana account:`,
      publicKey,
      '',
      'Sign in to Tank Arena',
      '',
      `URI: ${uri}`,
      'Version: 1',
      'Chain ID: mainnet',
      `Nonce: ${nonce}`,
      `Issued At: ${issuedAt.toISOString()}`,
      `Expiration Time: ${expiresAt.toISOString()}`,
    ].join('\n');
    const nonceHash = this.hash(nonce);
    await Promise.all([
      this.prisma.walletNonce.create({
        data: { walletAddress: publicKey, nonceHash, message, expiresAt },
      }),
      this.redis.client.set(`auth:phantom:${nonceHash}`, message, 'PXAT', expiresAt.getTime()),
    ]);
    return { message, expiresAt: expiresAt.toISOString() };
  }

  async verify(publicKey: string, message: string, signature: string) {
    await this.verifyChallenge(publicKey, message, signature);
    const user = await this.users.upsertPhantom(publicKey);
    if (!user.username) {
      return {
        requiresUsername: true,
        onboardingToken: await this.tokens.issueOnboarding(user.id, AuthProvider.PHANTOM),
      };
    }
    return {
      requiresUsername: false,
      ...(await this.tokens.issueSession(user, AuthProvider.PHANTOM)),
      user,
    };
  }

  async verifyChallenge(publicKey: string, message: string, signature: string): Promise<void> {
    const nonce = this.extractLine(message, 'Nonce: ');
    const uri = this.extractLine(message, 'URI: ');
    const allowedDomains = this.config
      .getOrThrow<string>('AUTH_ALLOWED_DOMAINS')
      .split(',')
      .map(value => value.trim());
    let hostname: string;
    try {
      hostname = new URL(uri).hostname;
    } catch {
      throw new UnauthorizedException('Invalid SIWS URI');
    }
    if (!allowedDomains.includes(hostname)) throw new UnauthorizedException('SIWS domain is not allowed');

    const nonceHash = this.hash(nonce);
    const stored = await this.prisma.walletNonce.findUnique({ where: { nonceHash } });
    if (
      !stored ||
      stored.walletAddress !== publicKey ||
      stored.message !== message ||
      stored.consumedAt ||
      stored.expiresAt <= new Date()
    ) {
      throw new UnauthorizedException('Challenge is invalid or expired');
    }
    const valid = nacl.sign.detached.verify(
      new TextEncoder().encode(message),
      this.decodeSignature(signature),
      this.decodePublicKey(publicKey),
    );
    if (!valid) throw new UnauthorizedException('Invalid Phantom signature');

    const consumed = await this.prisma.walletNonce.updateMany({
      where: { id: stored.id, consumedAt: null, expiresAt: { gt: new Date() } },
      data: { consumedAt: new Date() },
    });
    if (consumed.count !== 1) throw new UnauthorizedException('Challenge was already used');
    await this.redis.client.del(`auth:phantom:${nonceHash}`);
  }

  private extractLine(message: string, prefix: string): string {
    const value = message.split('\n').find(line => line.startsWith(prefix))?.slice(prefix.length).trim();
    if (!value) throw new UnauthorizedException('Malformed SIWS message');
    return value;
  }

  private decodePublicKey(value: string): Uint8Array {
    try {
      const decoded = bs58.decode(value);
      if (decoded.length !== nacl.sign.publicKeyLength) throw new Error();
      return decoded;
    } catch {
      throw new UnauthorizedException('Invalid Solana public key');
    }
  }

  private decodeSignature(value: string): Uint8Array {
    try {
      const decoded = bs58.decode(value);
      if (decoded.length !== nacl.sign.signatureLength) throw new Error();
      return decoded;
    } catch {
      throw new UnauthorizedException('Invalid Solana signature');
    }
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }
}
