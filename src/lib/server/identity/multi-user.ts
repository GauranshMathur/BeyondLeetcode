import type { Db } from '../db.ts';
import type { Auth } from './auth.ts';
import { type IdentityResolver, LOCAL_LEARNER_ID } from './index.ts';
import { currentSession } from './session-binding.ts';

/**
 * Multi-user adapter: a request is the Account its session cookie names. The session is read from
 * the database on every request (no cookie cache), so a revoked session or removed user loses
 * access at once. No cookie, a forged one, a banned user or an Account without a Learner is nobody.
 */
export function createMultiUserIdentity(auth: Auth): IdentityResolver {
	return {
		resolve: async ({ request }) => {
			const session = await currentSession(auth, request.headers);
			if (!session) return null;
			return {
				refreshedCookies: session.refreshedCookies,
				...session.identity,
				mustChangePassword: session.mustChangePassword
			};
		}
	};
}

/**
 * Brings Accounts and Learners back in step, at startup of a Multi-user Instance (C57). Two single
 * statements, so no write can land between a check and its repair: a Learner is created for any
 * User whose learnerId names none (Better Auth dropped its sign-up hook), and any Learner no User
 * references is deleted, its progress with it by the foreign keys (a removal whose deleteLearner
 * failed, or a sign-up that raced its own removal). Creating first means a Learner is never both.
 * The first admin's Learner ('local', carrying over Local progress) is never removed, and with no User
 * at all nothing is removed: a half-finished Setup or conversion keeps its progress for the admin
 * it is about to get. Never run in Local mode: the Local Learner has no User. Returns counts only.
 */
export async function repairLearners(db: Db): Promise<{ created: number; removed: number }> {
	const created = await db.$executeRaw`
		INSERT INTO "Learner" ("id")
		SELECT "u"."learnerId" FROM "User" AS "u"
		WHERE NOT EXISTS (SELECT 1 FROM "Learner" AS "l" WHERE "l"."id" = "u"."learnerId")`;
	const removed = await db.$executeRaw`
		DELETE FROM "Learner"
		WHERE "id" <> ${LOCAL_LEARNER_ID}
		  AND EXISTS (SELECT 1 FROM "User")
		  AND NOT EXISTS (SELECT 1 FROM "User" AS "u" WHERE "u"."learnerId" = "Learner"."id")`;
	return { created, removed };
}
