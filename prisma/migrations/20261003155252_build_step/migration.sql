-- CreateTable
CREATE TABLE "BuildStep" (
    "learnerId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "problemId" TEXT NOT NULL,
    "files" JSONB NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" DATETIME NOT NULL,

    PRIMARY KEY ("learnerId", "topicId", "language", "problemId")
);
