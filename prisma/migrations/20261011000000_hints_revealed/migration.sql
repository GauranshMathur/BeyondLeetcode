-- CreateTable
CREATE TABLE "HintsRevealed" (
    "learnerId" TEXT NOT NULL,
    "problemId" TEXT NOT NULL,
    "count" INTEGER NOT NULL,

    PRIMARY KEY ("learnerId", "problemId")
);
