CREATE TYPE "RoomType" AS ENUM ('PUBLIC', 'PRIVATE');

ALTER TABLE "Match"
  ADD COLUMN "roundId" TEXT,
  ADD COLUMN "roomName" TEXT,
  ADD COLUMN "roomType" "RoomType" NOT NULL DEFAULT 'PUBLIC';

-- Historical invariant before this migration: rewardsEligible was derived only
-- from room type (public=true, private=false). These fields are independent afterward.
UPDATE "Match"
SET
  "roundId" = "roomId",
  "roomType" = CASE
    WHEN "rewardsEligible" = false THEN 'PRIVATE'::"RoomType"
    ELSE 'PUBLIC'::"RoomType"
  END;

ALTER TABLE "Match"
  ALTER COLUMN "roundId" SET NOT NULL;

DROP INDEX "Match_roomId_key";

CREATE UNIQUE INDEX "Match_roundId_key" ON "Match"("roundId");
CREATE INDEX "Match_roomId_idx" ON "Match"("roomId");
CREATE INDEX "Match_roomType_endedAt_idx" ON "Match"("roomType", "endedAt");
