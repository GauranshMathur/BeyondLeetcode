-- CreateTable
CREATE TABLE "ChapterRead" (
    "learnerId" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "readAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("learnerId", "chapterId")
);
