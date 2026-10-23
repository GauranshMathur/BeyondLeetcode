-- A session is bound to the credential generation it was created under (see createAuth). Every existing
-- password Account gets a fresh generation and every existing session the generation of its user's password
-- Account (or "" with none), so the upgrade signs nobody out.
ALTER TABLE "Account" ADD COLUMN "credentialGeneration" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Session" ADD COLUMN "credentialGeneration" TEXT NOT NULL DEFAULT '';
UPDATE "Account" SET "credentialGeneration" = lower(hex(randomblob(16))) WHERE "password" IS NOT NULL;
UPDATE "Session" SET "credentialGeneration" = COALESCE(
    (SELECT "a"."credentialGeneration" FROM "Account" AS "a"
     WHERE "a"."userId" = "Session"."userId" AND "a"."providerId" = 'credential'
     ORDER BY "a"."updatedAt" DESC, "a"."id" DESC LIMIT 1),
    '');
