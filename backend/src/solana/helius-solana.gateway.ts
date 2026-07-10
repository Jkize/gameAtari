import { Injectable } from '@nestjs/common';
import {
  Commitment,
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import bs58 from 'bs58';
import {
  SolanaGateway,
  SolanaGatewayError,
  SolanaGatewayErrorCode,
  SplTransferRequest,
  SplTransferResult,
  SplTransferVerification,
  TokenBalanceResult,
  TransactionStatusResult,
} from './solana.types';
import { SolanaConfigService } from './solana-config.service';

const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
const SOL_FEE_CUSHION_LAMPORTS = 10_000;

@Injectable()
export class HeliusSolanaGateway extends SolanaGateway {
  private readonly commitment: Commitment = 'confirmed';
  private readonly connection: Connection;

  constructor(private readonly solanaConfig: SolanaConfigService) {
    super();
    this.connection = new Connection(this.solanaConfig.rpcUrl(), this.commitment);
  }

  validatePublicKey(value: string): boolean {
    try {
      // eslint-disable-next-line no-new
      new PublicKey(value);
      return true;
    } catch {
      return false;
    }
  }

  async getMintDecimals(mint: string): Promise<number> {
    const mintPublicKey = this.publicKeyOrThrow(mint, SolanaGatewayErrorCode.INVALID_MINT);
    try {
      const response = await this.connection.getParsedAccountInfo(mintPublicKey, this.commitment);
      const parsed = response.value?.data;
      if (!parsed || typeof parsed !== 'object' || !('parsed' in parsed)) {
        throw new SolanaGatewayError(
          SolanaGatewayErrorCode.INVALID_RPC_RESPONSE,
          'Mint account response is not parsed',
          false,
        );
      }
      const decimals = (parsed as { parsed?: { info?: { decimals?: unknown } } }).parsed?.info?.decimals;
      if (!Number.isInteger(decimals)) {
        throw new SolanaGatewayError(
          SolanaGatewayErrorCode.INVALID_RPC_RESPONSE,
          'Mint decimals are missing from RPC response',
          false,
        );
      }
      return decimals as number;
    } catch (error) {
      this.throwGatewayError(error);
    }
  }

  async getTokenBalance(walletAddress: string, mint: string): Promise<TokenBalanceResult> {
    const walletPublicKey = this.publicKeyOrThrow(walletAddress, SolanaGatewayErrorCode.INVALID_WALLET);
    const mintPublicKey = this.publicKeyOrThrow(mint, SolanaGatewayErrorCode.INVALID_MINT);
    const decimals = await this.getMintDecimals(mint);

    try {
      const response = await this.connection.getTokenAccountsByOwner(
        walletPublicKey,
        { mint: mintPublicKey },
        this.commitment,
      );
      if (!response.value.length) return { kind: 'token_account_not_found', amountRaw: 0n, decimals };

      let amountRaw = 0n;
      for (const { pubkey } of response.value) {
        const balance = await this.connection.getTokenAccountBalance(pubkey, this.commitment);
        const amount = balance.value.amount;
        if (!/^\d+$/.test(amount)) {
          throw new SolanaGatewayError(
            SolanaGatewayErrorCode.INVALID_RPC_RESPONSE,
            'Token account balance is not an unsigned integer',
            false,
          );
        }
        amountRaw += BigInt(amount);
      }

      return { kind: 'found', amountRaw, decimals };
    } catch (error) {
      this.throwGatewayError(error);
    }
  }

  async getTransactionStatus(signature: string): Promise<TransactionStatusResult> {
    try {
      const statuses = await this.connection.getSignatureStatuses([signature], {
        searchTransactionHistory: true,
      });
      const status = statuses.value[0];
      if (!status) return { kind: 'not_found' };
      return {
        kind: 'found',
        confirmationStatus: status.confirmationStatus ?? null,
        err: status.err ?? null,
      };
    } catch (error) {
      this.throwGatewayError(error);
    }
  }

  async sendSplTokenTransfer(request: SplTransferRequest): Promise<SplTransferResult> {
    const distributor = this.loadDistributorKeypair();
    const mint = this.publicKeyOrThrow(request.mint, SolanaGatewayErrorCode.INVALID_MINT);
    const destinationOwner = this.publicKeyOrThrow(
      request.destinationWallet,
      SolanaGatewayErrorCode.INVALID_WALLET,
    );
    const tokenProgramId = await this.tokenProgramForMint(mint);
    const sourceAta = getAssociatedTokenAddressSync(
      mint,
      distributor.publicKey,
      false,
      tokenProgramId,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );
    const destinationAta = getAssociatedTokenAddressSync(
      mint,
      destinationOwner,
      false,
      tokenProgramId,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );

    await this.ensureDistributorTokenBalance(sourceAta, request.amountRaw);
    await this.ensureDestinationAtaExists(destinationAta);
    await this.ensureDistributorSolBalance(distributor.publicKey);

    const transaction = new Transaction().add(
      createTransferCheckedInstruction(
        sourceAta,
        mint,
        destinationAta,
        distributor.publicKey,
        request.amountRaw,
        request.decimals,
        [],
        tokenProgramId,
      ),
      new TransactionInstruction({
        keys: [],
        programId: MEMO_PROGRAM_ID,
        data: Buffer.from(`TANK_REWARD:${request.rewardId}`, 'utf8'),
      }),
    );

    try {
      const signature = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        [distributor],
        {
          commitment: this.commitment,
          skipPreflight: false,
          maxRetries: 3,
        },
      );
      return { signature };
    } catch (error) {
      this.throwGatewayError(error);
    }
  }

  async verifySplTokenTransfer(signature: string, request: SplTransferRequest): Promise<SplTransferVerification> {
    try {
      const tx = await this.connection.getParsedTransaction(signature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
      });
      if (!tx) return { kind: 'not_found' };
      if (tx.meta?.err) return { kind: 'failed', errorMessage: JSON.stringify(tx.meta.err) };

      const expectedRaw = request.amountRaw.toString();
      const mint = request.mint;
      const destinationWallet = request.destinationWallet;
      const instructions = tx.transaction.message.instructions;
      const transfer = instructions.find(ix => {
        if (!('parsed' in ix)) return false;
        const parsed = ix.parsed as { type?: string; info?: Record<string, unknown> };
        const info = parsed.info;
        return parsed.type === 'transferChecked'
          && info?.mint === mint
          && info?.destination
          && info?.tokenAmount
          && (info.tokenAmount as { amount?: string }).amount === expectedRaw;
      });

      const postOwner = tx.meta?.postTokenBalances?.some(balance =>
        balance.mint === mint &&
        balance.owner === destinationWallet,
      );

      if (!transfer || !postOwner) {
        return { kind: 'ambiguous', errorMessage: 'Confirmed transaction does not match expected reward transfer' };
      }

      return { kind: 'confirmed' };
    } catch (error) {
      if (error instanceof SolanaGatewayError) throw error;
      return {
        kind: 'ambiguous',
        errorMessage: error instanceof Error ? error.message : 'Could not verify transaction',
      };
    }
  }

  private publicKeyOrThrow(value: string, code: SolanaGatewayErrorCode): PublicKey {
    try {
      return new PublicKey(value);
    } catch {
      throw new SolanaGatewayError(code, `${code}: invalid public key`, false);
    }
  }

  private loadDistributorKeypair(): Keypair {
    const raw = this.solanaConfig.distributorWalletPrivateKey();
    try {
      const secret = raw.trim().startsWith('[')
        ? Uint8Array.from(JSON.parse(raw) as number[])
        : bs58.decode(raw.trim());
      return Keypair.fromSecretKey(secret);
    } catch {
      throw new SolanaGatewayError(
        SolanaGatewayErrorCode.DISTRIBUTOR_PRIVATE_KEY_INVALID,
        'Distributor private key is invalid',
        false,
      );
    }
  }

  private async tokenProgramForMint(mint: PublicKey): Promise<PublicKey> {
    try {
      const info = await this.connection.getAccountInfo(mint, this.commitment);
      if (!info) {
        throw new SolanaGatewayError(SolanaGatewayErrorCode.INVALID_MINT, 'Mint account does not exist', false);
      }
      return info.owner.equals(TOKEN_2022_PROGRAM_ID) ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
    } catch (error) {
      this.throwGatewayError(error);
    }
  }

  private async ensureDistributorTokenBalance(sourceAta: PublicKey, amountRaw: bigint): Promise<void> {
    try {
      const balance = await this.connection.getTokenAccountBalance(sourceAta, this.commitment);
      const available = BigInt(balance.value.amount);
      if (available < amountRaw) {
        throw new SolanaGatewayError(
          SolanaGatewayErrorCode.DISTRIBUTOR_INSUFFICIENT_TOKEN_BALANCE,
          'Distributor has insufficient token balance',
          true,
        );
      }
    } catch (error) {
      if (error instanceof SolanaGatewayError) throw error;
      throw new SolanaGatewayError(
        SolanaGatewayErrorCode.DISTRIBUTOR_INSUFFICIENT_TOKEN_BALANCE,
        'Distributor token account is missing or unavailable',
        true,
      );
    }
  }

  private async ensureDestinationAtaExists(destinationAta: PublicKey): Promise<void> {
    try {
      const destinationInfo = await this.connection.getAccountInfo(destinationAta, this.commitment);
      if (!destinationInfo) {
        throw new SolanaGatewayError(
          SolanaGatewayErrorCode.DESTINATION_ATA_NOT_FOUND,
          'Destination associated token account does not exist',
          false,
        );
      }
    } catch (error) {
      if (error instanceof SolanaGatewayError) throw error;
      this.throwGatewayError(error);
    }
  }

  private async ensureDistributorSolBalance(distributor: PublicKey): Promise<void> {
    try {
      const balance = await this.connection.getBalance(distributor, this.commitment);
      const required = SOL_FEE_CUSHION_LAMPORTS;
      if (balance < required || balance < LAMPORTS_PER_SOL / 10_000) {
        throw new SolanaGatewayError(
          SolanaGatewayErrorCode.DISTRIBUTOR_INSUFFICIENT_SOL,
          'Distributor has insufficient SOL',
          true,
        );
      }
    } catch (error) {
      if (error instanceof SolanaGatewayError) throw error;
      this.throwGatewayError(error);
    }
  }

  private throwGatewayError(error: unknown): never {
    if (error instanceof SolanaGatewayError) throw error;
    throw new SolanaGatewayError(
      SolanaGatewayErrorCode.TEMPORARY_RPC_ERROR,
      error instanceof Error ? error.message : 'Solana RPC request failed',
      true,
    );
  }
}
