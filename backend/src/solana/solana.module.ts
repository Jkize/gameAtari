import { Module } from '@nestjs/common';
import { HeliusSolanaGateway } from './helius-solana.gateway';
import { SolanaConfigService } from './solana-config.service';
import { SolanaGateway } from './solana.types';

@Module({
  providers: [
    SolanaConfigService,
    HeliusSolanaGateway,
    { provide: SolanaGateway, useExisting: HeliusSolanaGateway },
  ],
  exports: [SolanaConfigService, SolanaGateway],
})
export class SolanaModule {}
