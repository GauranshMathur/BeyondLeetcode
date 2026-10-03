-- CreateTable
CREATE TABLE "TopicLanguage" (
    "learnerId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "language" TEXT NOT NULL,

    PRIMARY KEY ("learnerId", "topicId")
);
