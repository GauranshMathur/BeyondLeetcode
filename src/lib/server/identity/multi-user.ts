import type { Db } from '../db.ts';
import type { Auth } from './auth.ts';
import type { IdentityResolver } from './index.ts';
import { FIRST_ADMIN_LEARNER_ID } from './setup.ts';

/**
 * Multi-user adapter: a request is the Account its session cookie names. The session is read from
 * the database on every request (no cookie cache), so a revoked session or removed user loses
 * access at once. No cookie, a forged one, a banned user or an Account without a Learner is nobody.
 */
export function createMultiUserIdentity(auth: Auth): IdentityResolver {
	return {
		resolve: async ({ request }) => {
			// `returnHeaders`: an active session is extended and its new cookie comes back as a header.
			const { headers, response: session } = await auth.api.getSession({
				headers: request.headers,
				returnHeaders: true
			});
			const user = session?.user;
			if (!user?.learnerId || user.banned) return null;
			return {
				refreshedCookies: headers.getSetCookie(),
				learnerId: user.learnerId,
				displayName: user.name,
				role: user.role === 'admin' ? 'admin' : 'learner',
				mustChangePassword: user.mustChangePassword ?? false
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
		WHERE "id" <> ${FIRST_ADMIN_LEARNER_ID}
		  AND EXISTS (SELECT 1 FROM "User")
		  AND NOT EXISTS (SELECT 1 FROM "User" AS "u" WHERE "u"."learnerId" = "Learner"."id")`;
	return { created, removed };
}

/**
 * Deletes the sessions that can never resolve: those whose credential generation is not their user's current
 * one (a sign-in that lost a race with a password write and could not remove its own row, a session whose
 * deletion failed, or one the C58 migration marked as superseded). One statement, so nothing lands between the
 * check and the delete; a user without a password Account has generation "", and so do their sessions, which
 * are kept. Run at startup of a Multi-user Instance, next to `repairLearners`. Returns the count only.
 */
export async function sweepStaleSessions(db: Db): Promise<number> {
	return db.$executeRaw`
		DELETE FROM "Session"
		WHERE "credentialGeneration" <> COALESCE(
			(SELECT "a"."credentialGeneration" FROM "Account" AS "a"
			 WHERE "a"."userId" = "Session"."userId" AND "a"."providerId" = 'credential'
			 ORDER BY "a"."updatedAt" DESC, "a"."id" DESC LIMIT 1),
			'')`;
}
