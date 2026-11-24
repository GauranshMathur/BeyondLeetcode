-- Every Learner that exists now gets Python, so nobody from before this change is stopped by the
-- first-run choice in the middle of a Problem. A Learner made after it has none until they choose.
ALTER TABLE "Learner" ADD COLUMN "startingLanguage" TEXT;
UPDATE "Learner" SET "startingLanguage" = 'python';
