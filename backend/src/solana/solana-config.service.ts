import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PublicKey } from '@solana/web3.js';
import {
  DEFAULT_REWARD_MAX_RETRIES,
  DEFAULT_REWARD_PROCESSOR_BATCH_SIZE,
  DEFAULT_REWARD_PROCESSOR_INTERVAL_MS,
  REWARDS_ENABLED_ENV,
} from '../rewards/rewards.config';
import { SolanaNetwork } from './solana.types';

@Injectable()
export class SolanaConfigService implements OnModuleInit {
  private readonly logger = new Logger(SolanaConfigService.name);

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    if (!this.rewardsEnabled()) return;
    if (!this.heliusApiKey()) throw new Error('HELIUS_API_KEY is required when rewards are enabled');
    if (!this.mint()) throw new Error('MINT is required when rewards are enabled');
    if (!this.isValidPublicKey(this.mint())) throw new Error('MINT must be a valid Solana public key');
    if (this.rewardProcessorEnabled() && !this.distributorWalletPrivateKey()) {
      throw new Error('DISTRIBUTOR_WALLET_PRIVATE_KEY is required when reward processor is enabled');
    }
    this.logger.log(`Solana rewards configured for ${this.network()} mint=${this.mint()}`);
  }

  rewardsEnabled(): boolean {
    return this.config.get<boolean>(REWARDS_ENABLED_ENV, true);
  }

  network(): SolanaNetwork {
    return this.config.get<string>('NODE_ENV', 'development') === 'production'
      ? 'mainnet-beta'
      : 'devnet';
  }

  mint(): string {
    return this.config.get<string>('MINT', '');
  }

  heliusApiKey(): string {
    return this.config.get<string>('HELIUS_API_KEY', '');
  }

  distributorWalletPrivateKey(): string {
    return this.config.get<string>('DISTRIBUTOR_WALLET_PRIVATE_KEY', '');
  }

  rewardProcessorEnabled(): boolean {
    return this.config.get<boolean>('REWARD_PROCESSOR_ENABLED', true);
  }

  rewardProcessorIntervalMs(): number {
    return this.config.get<number>('REWARD_PROCESSOR_INTERVAL_MS', DEFAULT_REWARD_PROCESSOR_INTERVAL_MS);
  }

  rewardProcessorBatchSize(): number {
    return this.config.get<number>('REWARD_PROCESSOR_BATCH_SIZE', DEFAULT_REWARD_PROCESSOR_BATCH_SIZE);
  }

  rewardMaxRetries(): number {
    return this.config.get<number>('REWARD_MAX_RETRIES', DEFAULT_REWARD_MAX_RETRIES);
  }

  rpcUrl(): string {
    const networkPath = this.network() === 'mainnet-beta' ? 'mainnet' : 'devnet';
    return `https://${networkPath}.helius-rpc.com/?api-key=${this.heliusApiKey()}`;
  }

  private isValidPublicKey(value: string): boolean {
    try {
      // eslint-disable-next-line no-new
      new PublicKey(value);
      return true;
    } catch {
      return false;
    }
  }
}
