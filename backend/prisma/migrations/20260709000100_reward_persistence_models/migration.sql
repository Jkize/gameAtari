-- Extend reward states without dropping the existing enum.
ALTER TYPE "RewardStatus" ADD VALUE IF NOT EXISTS 'NOT_ELIGIBLE';
ALTER TYPE "RewardStatus" ADD VALUE IF NOT EXISTS 'DAILY_LIMIT_REACHED';
ALTER TYPE "RewardStatus" ADD VALUE IF NOT EXISTS 'SUBMITTED';
ALTER TYPE "RewardStatus" ADD VALUE IF NOT EXISTS 'MANUAL_REVIEW';
ALTER TYPE "RewardStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

CREATE TYPE "RewardIneligibilityReason" AS ENUM (
  'USER_NOT_AUTHENTICATED',
  'WALLET_NOT_LINKED',
  'WALLET_NOT_VERIFIED',
  'INSUFFICIENT_TOKEN_BALANCE',
  'DAILY_LIMIT_REACHED'
);

-- Wallets are separated from auth accounts so a verified Phantom wallet can be
-- linked to exactly one user independently from the login provider used.
CREATE TABLE "Wallet" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "provider" "AuthProvider" NOT NULL DEFAULT 'PHANTOM',
  "address" TEXT NOT NULL,
  "verifiedAt" TIMESTAMP(3),
  "verificationMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

INSERT INTO "Wallet" (
  "id",
  "userId",
  "provider",
  "address",
  "verifiedAt",
  "createdAt",
  "updatedAt"
)
SELECT
  (
    substr(md5("id"::TEXT || ':wallet'), 1, 8) || '-' ||
    substr(md5("id"::TEXT || ':wallet'), 9, 4) || '-' ||
    substr(md5("id"::TEXT || ':wallet'), 13, 4) || '-' ||
    substr(md5("id"::TEXT || ':wallet'), 17, 4) || '-' ||
    substr(md5("id"::TEXT || ':wallet'), 21, 12)
  )::UUID,
  "userId",
  "provider",
  "walletAddress",
  "createdAt",
  "createdAt",
  "updatedAt"
FROM "AuthAccount"
WHERE "provider" = 'PHANTOM'
  AND "walletAddress" IS NOT NULL
ON CONFLICT DO NOTHING;

CREATE UNIQUE INDEX "Wallet_address_key" ON "Wallet"("address");
CREATE UNIQUE INDEX "Wallet_userId_provider_key" ON "Wallet"("userId", "provider");
CREATE INDEX "Wallet_userId_idx" ON "Wallet"("userId");
CREATE INDEX "Wallet_provider_verifiedAt_idx" ON "Wallet"("provider", "verifiedAt");

ALTER TABLE "Wallet"
  ADD CONSTRAINT "Wallet_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MatchPlayer" ADD COLUMN "playerId" TEXT;
UPDATE "MatchPlayer" SET "playerId" = "userId"::TEXT WHERE "playerId" IS NULL;
ALTER TABLE "MatchPlayer" ALTER COLUMN "playerId" SET NOT NULL;
ALTER TABLE "MatchPlayer" ALTER COLUMN "userId" DROP NOT NULL;
CREATE UNIQUE INDEX "MatchPlayer_matchId_playerId_key" ON "MatchPlayer"("matchId", "playerId");
CREATE INDEX "MatchPlayer_matchId_placement_idx" ON "MatchPlayer"("matchId", "placement");
CREATE INDEX "Match_endedAt_idx" ON "Match"("endedAt");
CREATE INDEX "Match_winnerUserId_idx" ON "Match"("winnerUserId");

-- RewardLog becomes the single row for eligibility and payout progress.
DROP INDEX IF EXISTS "RewardLog_matchId_userId_key";

ALTER TABLE "RewardLog" ADD COLUMN "placement" INTEGER;
ALTER TABLE "RewardLog" ADD COLUMN "potentialAmount" DECIMAL(20,8) NOT NULL DEFAULT 0;
ALTER TABLE "RewardLog" ADD COLUMN "mint" TEXT NOT NULL DEFAULT '';
ALTER TABLE "RewardLog" ADD COLUMN "tokenDecimals" INTEGER;
ALTER TABLE "RewardLog" ADD COLUMN "tokenBalanceChecked" DECIMAL(30,8);
ALTER TABLE "RewardLog" ADD COLUMN "eligible" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "RewardLog" ADD COLUMN "eligibilityCheckedAt" TIMESTAMP(3);
ALTER TABLE "RewardLog" ADD COLUMN "ineligibilityReason" "RewardIneligibilityReason";
ALTER TABLE "RewardLog" ADD COLUMN "idempotencyKey" TEXT;
ALTER TABLE "RewardLog" ADD COLUMN "transactionSignature" TEXT;
ALTER TABLE "RewardLog" ADD COLUMN "processingStartedAt" TIMESTAMP(3);
ALTER TABLE "RewardLog" ADD COLUMN "submittedAt" TIMESTAMP(3);
ALTER TABLE "RewardLog" ADD COLUMN "confirmedAt" TIMESTAMP(3);
ALTER TABLE "RewardLog" ADD COLUMN "failedAt" TIMESTAMP(3);
ALTER TABLE "RewardLog" ADD COLUMN "retryable" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "RewardLog" ADD COLUMN "retryCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "RewardLog" ADD COLUMN "nextRetryAt" TIMESTAMP(3);
ALTER TABLE "RewardLog" ADD COLUMN "errorCode" TEXT;

ALTER TABLE "RewardLog" ALTER COLUMN "walletAddress" DROP NOT NULL;
ALTER TABLE "RewardLog" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "RewardLog" ALTER COLUMN "amount" SET DEFAULT 0;
ALTER TABLE "RewardLog" ALTER COLUMN "asset" SET DEFAULT '';

UPDATE "RewardLog"
SET
  "placement" = COALESCE("placement", 1),
  "potentialAmount" = COALESCE("potentialAmount", "amount", 0),
  "mint" = COALESCE(NULLIF("mint", ''), "asset", ''),
  "idempotencyKey" = CONCAT('MATCH_REWARD:', "matchId"::TEXT, ':', COALESCE("placement", 1)::TEXT)
WHERE "placement" IS NULL
   OR "idempotencyKey" IS NULL;

ALTER TABLE "RewardLog" ALTER COLUMN "placement" SET NOT NULL;
ALTER TABLE "RewardLog" ALTER COLUMN "idempotencyKey" SET NOT NULL;

CREATE UNIQUE INDEX "RewardLog_matchId_placement_key" ON "RewardLog"("matchId", "placement");
CREATE UNIQUE INDEX "RewardLog_idempotencyKey_key" ON "RewardLog"("idempotencyKey");
CREATE UNIQUE INDEX "RewardLog_transactionSignature_key" ON "RewardLog"("transactionSignature");
CREATE INDEX "RewardLog_userId_createdAt_idx" ON "RewardLog"("userId", "createdAt");
CREATE INDEX "RewardLog_matchId_idx" ON "RewardLog"("matchId");
CREATE INDEX "RewardLog_createdAt_idx" ON "RewardLog"("createdAt");
CREATE INDEX "RewardLog_status_nextRetryAt_idx" ON "RewardLog"("status", "nextRetryAt");
CREATE INDEX "RewardLog_walletAddress_idx" ON "RewardLog"("walletAddress");

-- Daily limit ledger. The application computes rewardDate in America/Bogota.
CREATE TABLE "DailyRewardLimit" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "walletAddress" TEXT NOT NULL,
  "mint" TEXT NOT NULL,
  "rewardDate" DATE NOT NULL,
  "reservedAmount" DECIMAL(20,8) NOT NULL DEFAULT 0,
  "sentAmount" DECIMAL(20,8) NOT NULL DEFAULT 0,
  "cancelledAmount" DECIMAL(20,8) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DailyRewardLimit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DailyRewardLimit_userId_walletAddress_mint_rewardDate_key"
  ON "DailyRewardLimit"("userId", "walletAddress", "mint", "rewardDate");
CREATE INDEX "DailyRewardLimit_userId_rewardDate_idx" ON "DailyRewardLimit"("userId", "rewardDate");
CREATE INDEX "DailyRewardLimit_walletAddress_rewardDate_idx" ON "DailyRewardLimit"("walletAddress", "rewardDate");
CREATE INDEX "DailyRewardLimit_mint_rewardDate_idx" ON "DailyRewardLimit"("mint", "rewardDate");

ALTER TABLE "DailyRewardLimit"
  ADD CONSTRAINT "DailyRewardLimit_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
