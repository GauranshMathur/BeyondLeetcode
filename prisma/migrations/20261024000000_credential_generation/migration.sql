-- A session is bound to the credential generation it was created under (see createAuth). Every existing
-- password Account gets a fresh generation and every existing session the generation of its user's password
-- Account (or "" with none), so the upgrade signs nobody out, except those already refused (below).
ALTER TABLE "Account" ADD COLUMN "credentialGeneration" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Session" ADD COLUMN "credentialGeneration" TEXT NOT NULL DEFAULT '';
UPDATE "Account" SET "credentialGeneration" = lower(hex(randomblob(16))) WHERE "password" IS NOT NULL;
-- A session that began before its user's password was last set is already refused (C53: the credential
-- Account's updatedAt is later than the session's createdAt, compared to the millisecond). Those, whose
-- deletion failed, must not come back to life: they get a value no generation can equal. Every other
-- session gets its user's current generation, or "" with none.
UPDATE "Session" SET "credentialGeneration" = COALESCE(
    (SELECT CASE
        WHEN strftime('%Y-%m-%d %H:%M:%f', "a"."updatedAt") > strftime('%Y-%m-%d %H:%M:%f', "Session"."createdAt")
        THEN 'superseded-before-credential-generation'
        ELSE "a"."credentialGeneration"
     END
     FROM "Account" AS "a"
     WHERE "a"."userId" = "Session"."userId" AND "a"."providerId" = 'credential'
     ORDER BY "a"."updatedAt" DESC, "a"."id" DESC LIMIT 1),
    '');
