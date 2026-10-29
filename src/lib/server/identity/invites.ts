import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Db } from '../db.ts';
import type { LogPatterns } from '../logging.ts';
import { NotAdminError } from './accounts.ts';
import type { Identity } from './index.ts';

/** An Invite works for 7 days from its creation. */
export const INVITE_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

/** An Invite token is this many random bytes. */
export const INVITE_TOKEN_BYTES = 32;

/** The bytes as base64url, no padding: 43 characters. */
export const INVITE_TOKEN_LENGTH = Math.ceil((INVITE_TOKEN_BYTES * 4) / 3);

const TOKEN_SHAPE = new RegExp(`^[A-Za-z0-9_-]{${INVITE_TOKEN_LENGTH}}$`);

/**
 * The cookie the Accept invite page sets (httpOnly, SameSite=Lax) and the registration gate reads: the
 * invite token. A named constant so the page and the hooks cannot drift.
 */
export const INVITE_COOKIE = 'beyondleetcode_invite';

/** Where the invite cookie is set: the auth endpoints, which include the provider callback (`accept.ts`). */
export const INVITE_COOKIE_PATH = '/api/auth';

/** The invite token in a request's `Cookie` header, or undefined. */
export function inviteTokenFrom(headers: Headers | undefined | null): string | undefined {
	const cookie = headers?.get('cookie');
	if (!cookie) return undefined;
	for (const part of cookie.split(';')) {
		const at = part.indexOf('=');
		if (at !== -1 && part.slice(0, at).trim() === INVITE_COOKIE) {
			return part.slice(at + 1).trim() || undefined;
		}
	}
	return undefined;
}

/**
 * `/invite/<token>`: the token is a credential, so no text that reaches a log may hold it. Also a token-length
 * base64url run after `/invite/` and spaces, which is how `console.log('/invite/', token)` prints once its
 * arguments are joined. `/invite/[token]` (a route id) is not a token and is left as it is.
 */
const INVITE_PATH = new RegExp(
	`/invite/(?:(?!\\[)[^\\s/?#"')\\]]+|[ \\t]+[A-Za-z0-9_-]{${INVITE_TOKEN_LENGTH}}(?![A-Za-z0-9_-]))`,
	'g'
);

const QUOTE = `\\\\*["']`;
/**
 * The cookie as it appears in text, in any of the shapes a log gives it: `name=value`, `name = value`,
 * `name="value"`, `name='value'`, an escaped JSON quote (`\"name\":\"value\"`), a structured field
 * (`name: 'value'`, `"name":"value"`) and a quoted value that never closes. Spaces round `=`/`:` are
 * horizontal only, so a match never crosses into the next line. Whatever comes before the name does not
 * matter (`?a=1&name=...`, `a;name=...`), so a longer name that ends in ours is redacted too: over-redacting
 * a harmless cookie is the safe side.
 */
const INVITE_COOKIE_TEXT = new RegExp(
	`(?:${QUOTE})?${INVITE_COOKIE}(?:${QUOTE})?[ \\t]*[:=][ \\t]*` +
		`(?:(${QUOTE})[^"'\\n\\\\]*(${QUOTE})?|[^\\s;,"')\\]\\\\]+)`,
	'g'
);

/** What the log redaction engine takes out of any text: the invite token, by path and by cookie. */
export const INVITE_LOG_PATTERNS: LogPatterns = {
	bareTokenLength: INVITE_TOKEN_LENGTH,
	marked: (text) =>
		text
			.replace(INVITE_PATH, '/invite/[redacted]')
			.replace(
				INVITE_COOKIE_TEXT,
				(_match, open?: string, close?: string) =>
					`${INVITE_COOKIE}=${open ?? ''}[redacted]${close ?? ''}`
			)
};

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
	/**
	 * Uses the Invite this token names, in one conditional update (unused, not expired) that must change
	 * exactly one row. True means this caller holds the claim; false means refused, and nothing changed:
	 * a second use, an expiry, a cancel (the row is gone) and a concurrent accept that won all look the same.
	 * `lookup` is a check, not a claim: only this call makes an Invite spent.
	 */
	claim(token: string, now: Date): Promise<boolean>;
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
			const token = randomBytes(INVITE_TOKEN_BYTES).toString('base64url');
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

		async claim(token, now) {
			if (!TOKEN_SHAPE.test(token)) return false;
			const { count } = await db.invite.updateMany({
				where: { tokenHash: hashToken(token), usedAt: null, expiresAt: { gt: now } },
				data: { usedAt: now }
			});
			return count === 1;
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
