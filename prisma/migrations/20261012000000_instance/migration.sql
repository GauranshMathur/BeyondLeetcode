-- CreateTable
CREATE TABLE "Instance" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'instance',
    "mode" TEXT NOT NULL,
    "registrationMode" TEXT NOT NULL DEFAULT 'invite'
);

-- Existing installs have the Local Learner: they are already set up as Local.
INSERT INTO "Instance" ("id", "mode")
SELECT 'instance', 'local' WHERE EXISTS (SELECT 1 FROM "Learner" WHERE "id" = 'local');
