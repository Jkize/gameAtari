INSERT INTO "UserSetting" ("id", "userId", "key", "data", "createdAt", "updatedAt")
SELECT
  gen_random_uuid(),
  "User"."id",
  'tank_customization',
  '{}'::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "User"
ON CONFLICT ("userId", "key") DO NOTHING;
