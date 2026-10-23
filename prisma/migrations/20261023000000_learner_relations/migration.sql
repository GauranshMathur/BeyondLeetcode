-- The unique index on Account (providerId, accountId) below fails on existing duplicates, and a failed
-- migration stops the container. Two concurrent admin password resets on the old schema could leave two
-- credential Accounts of one User, so same-owner duplicates are removed first: the most recently updated
-- row is kept. Duplicates across different Users are never merged: the migration stops with a fixed
-- error naming the problem (SQLite reports the CHECK constraint's name), before changing anything.
CREATE TEMP TABLE "migration_guard" (
    "n" INTEGER NOT NULL,
    CONSTRAINT "stopped_the_same_provider_identity_belongs_to_different_users_resolve_by_hand" CHECK ("n" = 0)
);
INSERT INTO "migration_guard" ("n")
    SELECT COUNT(*) FROM (
        SELECT 1 FROM "Account" GROUP BY "providerId", "accountId" HAVING COUNT(DISTINCT "userId") > 1
    );
DROP TABLE "migration_guard";
DELETE FROM "Account" WHERE EXISTS (
    SELECT 1 FROM "Account" AS "b"
    WHERE "b"."providerId" = "Account"."providerId" AND "b"."accountId" = "Account"."accountId"
      AND "b"."userId" = "Account"."userId"
      AND ("b"."updatedAt" > "Account"."updatedAt"
           OR ("b"."updatedAt" = "Account"."updatedAt" AND "b"."id" > "Account"."id"))
);

-- Progress whose Learner is gone (a write that landed after the Learner was removed, or a removal
-- that failed part-way) cannot satisfy the new foreign keys, and nobody can reach it: delete it
-- before the tables are rebuilt. Progress whose Learner exists is copied across untouched.
DELETE FROM "ChapterRead" WHERE "learnerId" NOT IN (SELECT "id" FROM "Learner");
DELETE FROM "BuildStep" WHERE "learnerId" NOT IN (SELECT "id" FROM "Learner");
DELETE FROM "TopicLanguage" WHERE "learnerId" NOT IN (SELECT "id" FROM "Learner");
DELETE FROM "HintsRevealed" WHERE "learnerId" NOT IN (SELECT "id" FROM "Learner");
DELETE FROM "Submission" WHERE "learnerId" NOT IN (SELECT "id" FROM "Learner");

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ChapterRead" (
    "learnerId" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "readAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("learnerId", "chapterId"),
    CONSTRAINT "ChapterRead_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "Learner" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ChapterRead" ("chapterId", "learnerId", "readAt") SELECT "chapterId", "learnerId", "readAt" FROM "ChapterRead";
DROP TABLE "ChapterRead";
ALTER TABLE "new_ChapterRead" RENAME TO "ChapterRead";
CREATE TABLE "new_BuildStep" (
    "learnerId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "problemId" TEXT NOT NULL,
    "files" JSONB NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" DATETIME NOT NULL,

    PRIMARY KEY ("learnerId", "topicId", "language", "problemId"),
    CONSTRAINT "BuildStep_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "Learner" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_BuildStep" ("files", "language", "learnerId", "problemId", "revision", "topicId", "updatedAt") SELECT "files", "language", "learnerId", "problemId", "revision", "topicId", "updatedAt" FROM "BuildStep";
DROP TABLE "BuildStep";
ALTER TABLE "new_BuildStep" RENAME TO "BuildStep";
CREATE TABLE "new_TopicLanguage" (
    "learnerId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "language" TEXT NOT NULL,

    PRIMARY KEY ("learnerId", "topicId"),
    CONSTRAINT "TopicLanguage_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "Learner" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_TopicLanguage" ("language", "learnerId", "topicId") SELECT "language", "learnerId", "topicId" FROM "TopicLanguage";
DROP TABLE "TopicLanguage";
ALTER TABLE "new_TopicLanguage" RENAME TO "TopicLanguage";
CREATE TABLE "new_HintsRevealed" (
    "learnerId" TEXT NOT NULL,
    "problemId" TEXT NOT NULL,
    "count" INTEGER NOT NULL,

    PRIMARY KEY ("learnerId", "problemId"),
    CONSTRAINT "HintsRevealed_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "Learner" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_HintsRevealed" ("count", "learnerId", "problemId") SELECT "count", "learnerId", "problemId" FROM "HintsRevealed";
DROP TABLE "HintsRevealed";
ALTER TABLE "new_HintsRevealed" RENAME TO "HintsRevealed";
CREATE TABLE "new_Submission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "learnerId" TEXT NOT NULL,
    "problemId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "files" JSONB NOT NULL,
    "verdict" TEXT NOT NULL,
    "failingProblemId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Submission_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "Learner" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Submission" ("createdAt", "failingProblemId", "files", "id", "language", "learnerId", "problemId", "topicId", "verdict") SELECT "createdAt", "failingProblemId", "files", "id", "language", "learnerId", "problemId", "topicId", "verdict" FROM "Submission";
DROP TABLE "Submission";
ALTER TABLE "new_Submission" RENAME TO "Submission";
CREATE INDEX "Submission_learnerId_createdAt_idx" ON "Submission"("learnerId", "createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Account_providerId_accountId_key" ON "Account"("providerId", "accountId");

