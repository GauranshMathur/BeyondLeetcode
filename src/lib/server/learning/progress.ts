import type { Catalogue } from '../content/catalogue.ts';
import type { Db } from '../db.ts';
import {
	type AcceptedView,
	acceptedDiff,
	type Progress,
	type ProgressChange,
	reachChapter
} from './rules.ts';

/** Where progress is recorded and read from. */
export interface ProgressDeps {
	catalogue: Catalogue;
	db: Db;
}

/** What a Submission stores. */
export type SubmissionRecord = Parameters<Db['submission']['create']>[0]['data'];

/** Prisma's error code for a second row with the same unique key. */
function isUniqueViolation(e: unknown): boolean {
	return (e as { code?: string } | null)?.code === 'P2002';
}

/** Read marks and Submissions give every status; the Topic of the latest activity is the current one. */
export async function loadProgress(
	catalogue: Catalogue,
	db: Pick<Db, 'chapterRead' | 'submission'>,
	learnerId: string,
	/** Leaves this progress event out: the state just before it. */
	except?: { submissionId?: string; chapterId?: string }
): Promise<Progress> {
	const reads = await db.chapterRead.findMany({
		where: { learnerId, ...(except?.chapterId && { chapterId: { not: except.chapterId } }) },
		orderBy: { readAt: 'desc' }
	});
	const submissions = await db.submission.findMany({
		where: { learnerId, ...(except?.submissionId && { id: { not: except.submissionId } }) },
		orderBy: { createdAt: 'desc' },
		select: { problemId: true, topicId: true, verdict: true, createdAt: true }
	});
	const solved = new Set(
		submissions.filter((s) => s.verdict === 'Accepted').map((s) => s.problemId)
	);
	const attempted = new Set(submissions.map((s) => s.problemId).filter((id) => !solved.has(id)));
	const recentRead = reads[0];
	const recentSubmission = submissions[0];
	const recentTopicId =
		recentSubmission && (!recentRead || recentSubmission.createdAt >= recentRead.readAt)
			? recentSubmission.topicId
			: recentRead && catalogue.chapter(recentRead.chapterId)?.topicId;
	return {
		readChapters: new Set(reads.map((r) => r.chapterId)),
		solvedProblems: solved,
		attemptedProblems: attempted,
		...(recentTopicId && { recentTopicId })
	};
}

/**
 * Records a Chapter read and says what it changed. Throws NotFound or TopicLocked, writing
 * nothing. Only the call that inserts the mark reports the change; a repeat, concurrent or
 * not, gets none.
 */
export async function recordChapterRead(
	{ catalogue, db }: ProgressDeps,
	learnerId: string,
	chapterId: string,
	readAt: Date
): Promise<ProgressChange> {
	const current = await loadProgress(catalogue, db, learnerId);
	const change = reachChapter(catalogue, current, chapterId); // NotFound / TopicLocked
	if (current.readChapters.has(chapterId)) return change;
	try {
		// The insert comes first so the transaction takes SQLite's write lock before it reads
		// anything: the read below then sees exactly the marks committed before this one.
		return await db.$transaction(async (tx) => {
			await tx.chapterRead.create({ data: { learnerId, chapterId, readAt } });
			const before = await loadProgress(catalogue, tx, learnerId, { chapterId });
			return reachChapter(catalogue, before, chapterId);
		});
	} catch (e) {
		if (!isUniqueViolation(e)) throw e;
		// A concurrent call inserted the mark first and reports it; this one changed nothing.
		return reachChapter(catalogue, await loadProgress(catalogue, db, learnerId), chapterId);
	}
}

/**
 * Records a Submission and says what it changed: the Problem's status and, when Accepted,
 * the Accepted panel. One short transaction; the Runner has already answered.
 */
export async function recordSubmission(
	{ catalogue, db }: ProgressDeps,
	learnerId: string,
	submission: SubmissionRecord
): Promise<{ submissionId: string; solved: boolean; accepted?: AcceptedView }> {
	// The insert comes first so the transaction takes SQLite's write lock before it reads
	// anything (the libSQL adapter opens transactions deferred): another submit then waits, and
	// the reads below see exactly the Submissions committed before this one.
	return db.$transaction(async (tx) => {
		const { id: submissionId } = await tx.submission.create({ data: submission });
		const before = await loadProgress(catalogue, tx, learnerId, { submissionId });
		const after = await loadProgress(catalogue, tx, learnerId);
		return {
			submissionId,
			solved: after.solvedProblems.has(submission.problemId),
			...(submission.verdict === 'Accepted' && {
				accepted: acceptedDiff(catalogue, before, after, submission.problemId)
			})
		};
	});
}

type Tx = Parameters<Parameters<Db['$transaction']>[0]>[0];

/**
 * How each table holding a Learner's progress (a Prisma model with a `learnerId`) is cleared.
 * Adding such a model without an entry here fails reset.test.ts.
 */
const CLEAR: Record<string, (tx: Tx, learnerId: string) => Promise<unknown>> = {
	chapterRead: (tx, learnerId) => tx.chapterRead.deleteMany({ where: { learnerId } }),
	buildStep: (tx, learnerId) => tx.buildStep.deleteMany({ where: { learnerId } }),
	topicLanguage: (tx, learnerId) => tx.topicLanguage.deleteMany({ where: { learnerId } }),
	hintsRevealed: (tx, learnerId) => tx.hintsRevealed.deleteMany({ where: { learnerId } }),
	submission: (tx, learnerId) => tx.submission.deleteMany({ where: { learnerId } })
};

export const PROGRESS_TABLES = Object.keys(CLEAR);

/** Deletes everything the Learner has, in one transaction. The Learner row stays. */
export async function resetProgress(db: Db, learnerId: string): Promise<void> {
	await db.$transaction(async (tx) => {
		for (const clear of Object.values(CLEAR)) await clear(tx, learnerId);
	});
}

/**
 * Removes a Learner for good: everything `resetProgress` clears (the `CLEAR` list) and the Learner row,
 * in one transaction, so a failure part-way deletes nothing. Harmless for a Learner that has no row, or
 * none at all. An Account's removal calls it (accounts.ts); it never runs for the Local Learner.
 */
export async function deleteLearner(db: Db, learnerId: string): Promise<void> {
	await db.$transaction(async (tx) => {
		for (const clear of Object.values(CLEAR)) await clear(tx, learnerId);
		await tx.learner.deleteMany({ where: { id: learnerId } });
	});
}
