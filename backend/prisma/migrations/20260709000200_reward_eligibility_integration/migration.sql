ALTER TYPE "RewardIneligibilityReason" ADD VALUE IF NOT EXISTS 'USER_NOT_AUTHENTICATED';

ALTER TABLE "RewardLog" ALTER COLUMN "userId" DROP NOT NULL;

ALTER TABLE "MatchPlayer" ADD COLUMN IF NOT EXISTS "playerId" TEXT;
UPDATE "MatchPlayer" SET "playerId" = "userId"::TEXT WHERE "playerId" IS NULL;
ALTER TABLE "MatchPlayer" ALTER COLUMN "playerId" SET NOT NULL;
ALTER TABLE "MatchPlayer" ALTER COLUMN "userId" DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "MatchPlayer_matchId_playerId_key" ON "MatchPlayer"("matchId", "playerId");
