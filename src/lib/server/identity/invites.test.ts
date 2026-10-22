import { describe, expect, it } from 'vitest';
import { createTestDb } from '../test-db';
import { NotAdminError } from './accounts';
import { createInvites, hashToken, INVITE_LIFETIME_MS } from './invites';

const origin = 'https://learn.example.com';
const now = new Date('2026-10-16T12:00:00.000Z');
const admin = { learnerId: 'L-admin', displayName: 'Ada', role: 'admin' as const };
const learner = { learnerId: 'L-lin', displayName: 'Lin', role: 'learner' as const };

async function setup() {
	const db = await createTestDb();
	await db.learner.create({ data: { id: admin.learnerId } });
	await db.user.create({
		data: {
			id: 'u-admin',
			name: 'Ada',
			email: 'ada@example.com',
			role: 'admin',
			learnerId: 'L-admin'
		}
	});
	return { db, invites: createInvites({ db, origin }) };
}

describe('create', () => {
	it('returns a 43-character base64url token and a link on the origin', async () => {
		const { invites } = await setup();
		const made = await invites.create({ who: admin, now });
		expect(made.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
		expect(made.link).toBe(`${origin}/invite/${made.token}`);
	});

	it('stores only the SHA-256 of the token, valid for 7 days', async () => {
		const { db, invites } = await setup();
		const made = await invites.create({ who: admin, now });
		const rows = await db.invite.findMany();
		expect(rows).toHaveLength(1);
		expect(rows[0].tokenHash).toBe(hashToken(made.token));
		expect(rows[0].tokenHash).not.toContain(made.token);
		expect(JSON.stringify(rows)).not.toContain(made.token);
		expect(rows[0].createdByUserId).toBe('u-admin');
		expect(rows[0].usedAt).toBeNull();
		expect(rows[0].expiresAt.getTime() - now.getTime()).toBe(INVITE_LIFETIME_MS);
		expect(made.expiresAt).toBe(rows[0].expiresAt.toISOString());
	});

	it('makes a different token each time', async () => {
		const { invites } = await setup();
		const a = await invites.create({ who: admin, now });
		const b = await invites.create({ who: admin, now });
		expect(a.token).not.toBe(b.token);
	});

	it('refuses a learner and writes nothing', async () => {
		const { db, invites } = await setup();
		await expect(invites.create({ who: learner, now })).rejects.toBeInstanceOf(NotAdminError);
		expect(await db.invite.count()).toBe(0);
	});

	it('is removed with the admin who made it', async () => {
		const { db, invites } = await setup();
		await invites.create({ who: admin, now });
		await db.user.delete({ where: { id: 'u-admin' } });
		expect(await db.invite.count()).toBe(0);
	});
});

describe('listPending', () => {
	it('lists unused, unexpired Invites without the token or its hash', async () => {
		const { db, invites } = await setup();
		const made = await invites.create({ who: admin, now });
		const rows = await invites.listPending({ who: admin, now });
		expect(rows).toEqual([
			{ id: made.id, createdAt: now.toISOString(), expiresAt: made.expiresAt }
		]);
		const text = JSON.stringify(rows);
		expect(text).not.toContain(made.token);
		const stored = await db.invite.findFirstOrThrow();
		expect(text).not.toContain(stored.tokenHash);
	});

	it('leaves out used and expired Invites', async () => {
		const { db, invites } = await setup();
		const used = await invites.create({ who: admin, now });
		await db.invite.update({ where: { id: used.id }, data: { usedAt: now } });
		await invites.create({ who: admin, now });
		const later = new Date(now.getTime() + INVITE_LIFETIME_MS);
		expect(await invites.listPending({ who: admin, now })).toHaveLength(1);
		expect(await invites.listPending({ who: admin, now: later })).toHaveLength(0);
	});

	it('refuses a learner', async () => {
		const { invites } = await setup();
		await expect(invites.listPending({ who: learner, now })).rejects.toBeInstanceOf(NotAdminError);
	});
});

describe('cancel', () => {
	it('deletes a pending Invite, and its link no longer works', async () => {
		const { invites } = await setup();
		const made = await invites.create({ who: admin, now });
		expect(await invites.cancel({ who: admin, id: made.id })).toBe(true);
		expect(await invites.lookup(made.token, now)).toBeNull();
		expect(await invites.listPending({ who: admin, now })).toEqual([]);
	});

	it('is safe for an unknown, cancelled or used Invite', async () => {
		const { db, invites } = await setup();
		const made = await invites.create({ who: admin, now });
		await invites.cancel({ who: admin, id: made.id });
		expect(await invites.cancel({ who: admin, id: made.id })).toBe(false);
		expect(await invites.cancel({ who: admin, id: 'nope' })).toBe(false);
		const used = await invites.create({ who: admin, now });
		await db.invite.update({ where: { id: used.id }, data: { usedAt: now } });
		expect(await invites.cancel({ who: admin, id: used.id })).toBe(false);
		expect(await db.invite.count()).toBe(1);
	});

	it('refuses a learner and deletes nothing', async () => {
		const { db, invites } = await setup();
		const made = await invites.create({ who: admin, now });
		await expect(invites.cancel({ who: learner, id: made.id })).rejects.toBeInstanceOf(
			NotAdminError
		);
		expect(await db.invite.count()).toBe(1);
	});
});

describe('lookup', () => {
	it('finds a pending Invite by its token', async () => {
		const { invites } = await setup();
		const made = await invites.create({ who: admin, now });
		expect(await invites.lookup(made.token, now)).toEqual({ id: made.id });
	});

	it('refuses a missing, malformed, used or expired token', async () => {
		const { db, invites } = await setup();
		const made = await invites.create({ who: admin, now });
		expect(await invites.lookup('A'.repeat(43), now)).toBeNull();
		expect(await invites.lookup('', now)).toBeNull();
		expect(await invites.lookup(hashToken(made.token), now)).toBeNull();
		const justBefore = new Date(now.getTime() + INVITE_LIFETIME_MS - 1);
		expect(await invites.lookup(made.token, justBefore)).toEqual({ id: made.id });
		const atExpiry = new Date(now.getTime() + INVITE_LIFETIME_MS);
		expect(await invites.lookup(made.token, atExpiry)).toBeNull();
		await db.invite.update({ where: { id: made.id }, data: { usedAt: now } });
		expect(await invites.lookup(made.token, now)).toBeNull();
	});
});

describe('claim', () => {
	it('marks the Invite used and answers true exactly once', async () => {
		const { db, invites } = await setup();
		const made = await invites.create({ who: admin, now });

		expect(await invites.claim(made.token, now)).toBe(true);
		expect((await db.invite.findUniqueOrThrow({ where: { id: made.id } })).usedAt).toEqual(now);
		expect(await invites.claim(made.token, now)).toBe(false);
		expect(await invites.lookup(made.token, now)).toBeNull();
	});

	it('lets only one of several concurrent claims win', async () => {
		const { invites } = await setup();
		const made = await invites.create({ who: admin, now });

		const results = await Promise.all(
			Array.from({ length: 5 }, () => invites.claim(made.token, now))
		);

		expect(results.filter(Boolean)).toHaveLength(1);
	});

	it('refuses an expired, cancelled, unknown or malformed token and changes nothing', async () => {
		const { db, invites } = await setup();
		const expired = await invites.create({ who: admin, now });
		const cancelled = await invites.create({ who: admin, now });
		await invites.cancel({ who: admin, id: cancelled.id });

		const atExpiry = new Date(now.getTime() + INVITE_LIFETIME_MS);
		expect(await invites.claim(expired.token, atExpiry)).toBe(false);
		expect(await invites.claim(cancelled.token, now)).toBe(false);
		expect(await invites.claim('A'.repeat(43), now)).toBe(false);
		expect(await invites.claim(hashToken(expired.token), now)).toBe(false);
		expect(await invites.claim('', now)).toBe(false);
		expect((await db.invite.findUniqueOrThrow({ where: { id: expired.id } })).usedAt).toBeNull();
	});
});
