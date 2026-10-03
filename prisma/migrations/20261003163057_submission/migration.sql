-- CreateTable
CREATE TABLE "Submission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "learnerId" TEXT NOT NULL,
    "problemId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "files" JSONB NOT NULL,
    "verdict" TEXT NOT NULL,
    "failingProblemId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "Submission_learnerId_createdAt_idx" ON "Submission"("learnerId", "createdAt");
