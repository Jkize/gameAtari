export type SolanaNetwork = 'mainnet-beta' | 'devnet';

export type TokenBalanceResult =
  | { kind: 'found'; amountRaw: bigint; decimals: number }
  | { kind: 'token_account_not_found'; amountRaw: 0n; decimals: number };

export type TransactionStatusResult =
  | { kind: 'found'; confirmationStatus: string | null; err: unknown }
  | { kind: 'not_found' };

export interface SplTransferRequest {
  rewardId: string;
  mint: string;
  destinationWallet: string;
  amountRaw: bigint;
  decimals: number;
}

export interface SplTransferResult {
  signature: string;
}

export type SplTransferVerification =
  | { kind: 'confirmed' }
  | { kind: 'failed'; errorMessage: string }
  | { kind: 'not_found' }
  | { kind: 'ambiguous'; errorMessage: string };

export enum SolanaGatewayErrorCode {
  TEMPORARY_RPC_ERROR = 'TEMPORARY_RPC_ERROR',
  INVALID_RPC_RESPONSE = 'INVALID_RPC_RESPONSE',
  INVALID_MINT = 'INVALID_MINT',
  INVALID_WALLET = 'INVALID_WALLET',
  DISTRIBUTOR_PRIVATE_KEY_INVALID = 'DISTRIBUTOR_PRIVATE_KEY_INVALID',
  DISTRIBUTOR_INSUFFICIENT_TOKEN_BALANCE = 'DISTRIBUTOR_INSUFFICIENT_TOKEN_BALANCE',
  DISTRIBUTOR_INSUFFICIENT_SOL = 'DISTRIBUTOR_INSUFFICIENT_SOL',
  DESTINATION_ATA_NOT_FOUND = 'DESTINATION_ATA_NOT_FOUND',
  TRANSACTION_REJECTED = 'TRANSACTION_REJECTED',
}

export class SolanaGatewayError extends Error {
  constructor(
    readonly code: SolanaGatewayErrorCode,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

export abstract class SolanaGateway {
  abstract validatePublicKey(value: string): boolean;
  abstract getMintDecimals(mint: string): Promise<number>;
  abstract getTokenBalance(walletAddress: string, mint: string): Promise<TokenBalanceResult>;
  abstract getTransactionStatus(signature: string): Promise<TransactionStatusResult>;
  abstract sendSplTokenTransfer(request: SplTransferRequest): Promise<SplTransferResult>;
  abstract verifySplTokenTransfer(signature: string, request: SplTransferRequest): Promise<SplTransferVerification>;
}
