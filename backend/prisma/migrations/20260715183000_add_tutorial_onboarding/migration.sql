-- Existing players are exempt so the onboarding only applies to accounts
-- created after this release.
CREATE TYPE "TutorialStatus" AS ENUM ('PENDING', 'COMPLETED', 'SKIPPED', 'EXEMPT');

ALTER TABLE "User"
ADD COLUMN "tutorialStatus" "TutorialStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "tutorialFinishedAt" TIMESTAMP(3);

UPDATE "User"
SET "tutorialStatus" = 'EXEMPT';
