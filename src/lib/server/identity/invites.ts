import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Db } from '../db.ts';
import { NotAdminError } from './accounts.ts';
import type { Identity } from './index.ts';

/** An Invite works for 7 days from its creation. */
export const INVITE_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

/** 32 random bytes as base64url: 43 characters, no padding. */
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;

/** A pending Invite as the Users page lists it. Nothing the token can be rebuilt from is in it. */
export interface PendingInvite {
	id: string;
	/** ISO 8601. */
	createdAt: string;
	/** ISO 8601. */
	expiresAt: string;
}

/** What `create` returns: the one and only time the token and the link exist outside the invitee's hands. */
export interface CreatedInvite {
	id: string;
	token: string;
	link: string;
	expiresAt: string;
}

/**
 * The Invite module. An Invite is a link that works once, for one new account, for 7 days. The token
 * is 32 random bytes; only its SHA-256 is stored, so the table cannot give a link back. The admin
 * sees the link once, when it is created.
 *
 * `create`, `listPending` and `cancel` are for the admin: `who.role` must be `admin` exactly.
 * `lookup` is for the invitee, who has no Account; it judges against a `now` passed in.
 */
export interface Invites {
	create(input: { who: Identity; now: Date }): Promise<CreatedInvite>;
	/** Not used, not expired; oldest first. */
	listPending(input: { who: Identity; now: Date }): Promise<PendingInvite[]>;
	/**
	 * Deletes a pending Invite (the schema has no cancelled state). False, and nothing changed, when
	 * there is no such unused Invite: unknown, already cancelled and used look the same.
	 */
	cancel(input: { who: Identity; id: string }): Promise<boolean>;
	/** The Invite this token names, or null when it is missing, used, expired or cancelled. */
	lookup(token: string, now: Date): Promise<{ id: string } | null>;
}

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export function createInvites({ db, origin }: { db: Db; origin: string }): Invites {
	const requireAdmin = (who: Identity) => {
		if (who.role !== 'admin') throw new NotAdminError();
	};

	return {
		async create({ who, now }) {
			requireAdmin(who);
			// Identity names a Learner; the Invite belongs to the User that Learner signed in as.
			const user = await db.user.findUnique({
				where: { learnerId: who.learnerId },
				select: { id: true }
			});
			if (!user) throw new NotAdminError();
			const token = randomBytes(32).toString('base64url');
			const expiresAt = new Date(now.getTime() + INVITE_LIFETIME_MS);
			const id = randomUUID();
			await db.invite.create({
				data: {
					id,
					tokenHash: hashToken(token),
					createdAt: now,
					expiresAt,
					createdByUserId: user.id
				}
			});
			return { id, token, link: `${origin}/invite/${token}`, expiresAt: expiresAt.toISOString() };
		},

		async listPending({ who, now }) {
			requireAdmin(who);
			const rows = await db.invite.findMany({
				where: { usedAt: null, expiresAt: { gt: now } },
				orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
				select: { id: true, createdAt: true, expiresAt: true }
			});
			return rows.map((row) => ({
				id: row.id,
				createdAt: row.createdAt.toISOString(),
				expiresAt: row.expiresAt.toISOString()
			}));
		},

		async cancel({ who, id }) {
			requireAdmin(who);
			const { count } = await db.invite.deleteMany({ where: { id, usedAt: null } });
			return count > 0;
		},

		async lookup(token, now) {
			if (!TOKEN_SHAPE.test(token)) return null;
			const row = await db.invite.findUnique({
				where: { tokenHash: hashToken(token) },
				select: { id: true, usedAt: true, expiresAt: true }
			});
			if (!row || row.usedAt !== null || row.expiresAt.getTime() <= now.getTime()) return null;
			return { id: row.id };
		}
	};
}
