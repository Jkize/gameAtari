CREATE TYPE "AuthProvider" AS ENUM ('GOOGLE', 'PHANTOM');
CREATE TYPE "MatchStatus" AS ENUM ('COMPLETED', 'ABORTED');
CREATE TYPE "RewardStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED');

CREATE TABLE "User" (
  "id" UUID NOT NULL,
  "username" TEXT,
  "usernameNormalized" TEXT,
  "avatarUrl" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuthAccount" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "provider" "AuthProvider" NOT NULL,
  "providerAccountId" TEXT NOT NULL,
  "email" TEXT,
  "walletAddress" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AuthAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WalletNonce" (
  "id" UUID NOT NULL,
  "walletAddress" TEXT NOT NULL,
  "nonceHash" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WalletNonce_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuthSession" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "provider" "AuthProvider" NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Match" (
  "id" UUID NOT NULL,
  "roomId" TEXT NOT NULL,
  "mapName" TEXT,
  "status" "MatchStatus" NOT NULL DEFAULT 'COMPLETED',
  "winnerUserId" UUID,
  "startedAt" TIMESTAMP(3) NOT NULL,
  "endedAt" TIMESTAMP(3) NOT NULL,
  "durationSeconds" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MatchPlayer" (
  "id" UUID NOT NULL,
  "matchId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "placement" INTEGER NOT NULL,
  "kills" INTEGER NOT NULL DEFAULT 0,
  "deaths" INTEGER NOT NULL DEFAULT 0,
  "damageDealt" INTEGER NOT NULL DEFAULT 0,
  "damageTaken" INTEGER NOT NULL DEFAULT 0,
  "winner" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "MatchPlayer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RewardLog" (
  "id" UUID NOT NULL,
  "matchId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "walletAddress" TEXT NOT NULL,
  "amount" DECIMAL(20,8) NOT NULL,
  "asset" TEXT NOT NULL,
  "status" "RewardStatus" NOT NULL DEFAULT 'PENDING',
  "transactionId" TEXT,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RewardLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE UNIQUE INDEX "User_usernameNormalized_key" ON "User"("usernameNormalized");
CREATE INDEX "AuthAccount_userId_idx" ON "AuthAccount"("userId");
CREATE UNIQUE INDEX "AuthAccount_provider_providerAccountId_key" ON "AuthAccount"("provider", "providerAccountId");
CREATE UNIQUE INDEX "AuthAccount_provider_email_key" ON "AuthAccount"("provider", "email");
CREATE UNIQUE INDEX "AuthAccount_provider_walletAddress_key" ON "AuthAccount"("provider", "walletAddress");
CREATE UNIQUE INDEX "WalletNonce_nonceHash_key" ON "WalletNonce"("nonceHash");
CREATE INDEX "WalletNonce_walletAddress_expiresAt_idx" ON "WalletNonce"("walletAddress", "expiresAt");
CREATE INDEX "AuthSession_userId_expiresAt_idx" ON "AuthSession"("userId", "expiresAt");
CREATE UNIQUE INDEX "Match_roomId_key" ON "Match"("roomId");
CREATE INDEX "MatchPlayer_userId_idx" ON "MatchPlayer"("userId");
CREATE UNIQUE INDEX "MatchPlayer_matchId_userId_key" ON "MatchPlayer"("matchId", "userId");
CREATE INDEX "RewardLog_status_idx" ON "RewardLog"("status");
CREATE UNIQUE INDEX "RewardLog_matchId_userId_key" ON "RewardLog"("matchId", "userId");

ALTER TABLE "AuthAccount"
  ADD CONSTRAINT "AuthAccount_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuthSession"
  ADD CONSTRAINT "AuthSession_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Match"
  ADD CONSTRAINT "Match_winnerUserId_fkey"
  FOREIGN KEY ("winnerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MatchPlayer"
  ADD CONSTRAINT "MatchPlayer_matchId_fkey"
  FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MatchPlayer"
  ADD CONSTRAINT "MatchPlayer_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RewardLog"
  ADD CONSTRAINT "RewardLog_matchId_fkey"
  FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RewardLog"
  ADD CONSTRAINT "RewardLog_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
