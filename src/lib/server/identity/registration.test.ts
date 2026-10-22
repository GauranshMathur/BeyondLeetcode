import { describe, expect, it } from 'vitest';
import { createInstance } from '../instance.ts';
import { createFileTestDb } from '../test-db.ts';
import { type Admission, CLIENT_IP_HEADER, createAuth } from './auth.ts';
import { createInvites, INVITE_LIFETIME_MS } from './invites.ts';
import { createRegistration } from './registration.ts';
import { createFirstAdmin } from './setup.ts';

const attempt = { email: 'ada@example.com' };
const secret = 'test-secret-test-secret-test-secret-0123';
const origin = 'http://localhost:3000';
const body = { email: attempt.email, password: 'correct horse battery', name: 'Ada' };

type Registration = 'open' | 'invite';
const fakeInstance = (mode: 'local' | 'multi' | null, registration: Registration) => {
	const state = { mode, registration };
	return {
		state,
		mode: () => state.mode,
		registrationMode: () => state.registration
	};
};

// Each request comes from its own address: Better Auth's limiter allows three sign-ups per address
// in ten seconds, and these tests are about the registration gate, not the limiter.
let caller = 0;
const post = (auth: ReturnType<typeof createAuth>, payload: object = body) =>
	auth.handler(
		new Request(`${origin}/api/auth/sign-up/email`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				origin,
				[CLIENT_IP_HEADER]: `10.1.${caller >> 8}.${caller++ & 255}`
			},
			body: JSON.stringify(payload)
		})
	);

async function open(mode: 'local' | 'multi' | null, registration: Registration) {
	const db = await createFileTestDb();
	const instance = fakeInstance(mode, registration);
	const auth = createAuth({
		db,
		origin,
		secret,
		admitSignUp: createRegistration({ instance })
	});
	return { db, instance, auth };
}

it('refuses everyone outside createFirstAdmin when registration is invite-only', async () => {
	expect(
		await createRegistration({ instance: fakeInstance('multi', 'invite') })(attempt)
	).toBeNull();
});

it('admits anyone as a learner with a new Learner when a multi-user Instance is open', async () => {
	const { auth, db } = await open('multi', 'open');

	const res = await post(auth);

	expect(res.status).toBe(200);
	const user = await db.user.findFirstOrThrow();
	expect(user.role).toBe('learner');
	expect(user.learnerId).not.toBe('local');
	expect(await db.learner.findMany()).toEqual([expect.objectContaining({ id: user.learnerId })]);
	const cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]);
	const session = await auth.api.getSession({
		headers: new Headers({ cookie: cookie.join('; ') })
	});
	expect(session?.user.learnerId).toBe(user.learnerId);
});

it('refuses a direct post to the sign-up endpoint when invite-only, leaving nothing behind', async () => {
	const { auth, db } = await open('multi', 'invite');

	const res = await post(auth);

	expect(res.status).toBe(403);
	expect(await db.user.count()).toBe(0);
	expect(await db.learner.count()).toBe(0);
});

it('refuses sign-up in Local Mode and on an Instance not set up, whatever the Registration Mode', async () => {
	for (const mode of ['local', null] as const) {
		const { auth, db } = await open(mode, 'open');
		expect((await post(auth)).status).toBe(403);
		expect(await db.user.count()).toBe(0);
	}
});

it('reads the Registration Mode on each sign-up', async () => {
	const { auth, instance, db } = await open('multi', 'open');
	expect((await post(auth)).status).toBe(200);

	instance.state.registration = 'invite';
	expect((await post(auth, { ...body, email: 'b@example.com' })).status).toBe(403);

	instance.state.registration = 'open';
	expect((await post(auth, { ...body, email: 'c@example.com' })).status).toBe(200);
	expect(await db.user.count()).toBe(2);
});

it('lets a client body claim nothing: an open sign-up never becomes admin or takes the Local Learner', async () => {
	const { auth, db } = await open('multi', 'open');
	await db.learner.create({ data: { id: 'local' } });

	for (const extra of [{ role: 'admin' }, { learnerId: 'local' }]) {
		expect((await post(auth, { ...body, ...extra })).status).toBe(400);
	}
	expect(await db.user.count()).toBe(0);
});

it('admits createFirstAdmin onto the Local Learner as admin even when invite-only, and later visitors only as the mode allows', async () => {
	const db = await createFileTestDb();
	const real = await createInstance(db);
	const gate = createRegistration({ instance: real });
	const answers: (Admission | null)[] = [];
	const auth = createAuth({
		db,
		origin,
		secret,
		admitSignUp: async (a) => {
			const answer = await gate(a);
			answers.push(answer);
			return answer;
		}
	});

	await createFirstAdmin(
		{ instance: real, auth, db },
		{ name: 'Ada', email: attempt.email, password: 'correct horse battery' }
	);

	expect(answers.length).toBeGreaterThan(0);
	expect(answers).toEqual(answers.map(() => ({ learnerId: 'local', role: 'admin' })));
	expect(real.registrationMode()).toBe('invite');
	expect(await gate(attempt)).toBeNull();
});

describe('an Invite', () => {
	const admin = { learnerId: 'local', displayName: 'Ada', role: 'admin' as const };
	const now = new Date('2026-10-20T12:00:00.000Z');

	async function withInvite(registration: Registration = 'invite') {
		const db = await createFileTestDb();
		await db.learner.create({ data: { id: 'local' } });
		await db.user.create({
			data: {
				id: 'u-admin',
				name: 'Ada',
				email: 'admin@example.com',
				role: 'admin',
				learnerId: 'local'
			}
		});
		const invites = createInvites({ db, origin });
		const instance = fakeInstance('multi', registration);
		const gate = createRegistration({ instance, invites, now: () => now });
		const made = await invites.create({ who: admin, now });
		return { db, invites, instance, gate, made };
	}

	it('admits a valid token as a new learner when invite-only, without spending it', async () => {
		const { gate, made, db } = await withInvite();

		expect(await gate({ email: undefined, inviteToken: made.token })).toEqual({
			inviteToken: made.token
		});
		expect(await gate({ email: undefined, inviteToken: made.token })).toEqual({
			inviteToken: made.token
		});
		expect((await db.invite.findUniqueOrThrow({ where: { id: made.id } })).usedAt).toBeNull();
	});

	it('refuses no token, an unknown token, a used one and an expired one', async () => {
		const { gate, made, invites, instance } = await withInvite();
		expect(await gate({ email: undefined })).toBeNull();
		expect(await gate({ email: undefined, inviteToken: 'A'.repeat(43) })).toBeNull();

		const late = createRegistration({
			instance,
			invites,
			now: () => new Date(now.getTime() + INVITE_LIFETIME_MS)
		});
		expect(await late({ email: undefined, inviteToken: made.token })).toBeNull();

		await invites.claim(made.token, now);
		expect(await gate({ email: undefined, inviteToken: made.token })).toBeNull();
	});

	it('is not honoured in Local Mode, before Setup or without the Invites module', async () => {
		const { invites, made } = await withInvite();
		for (const mode of ['local', null] as const) {
			const gate = createRegistration({ instance: fakeInstance(mode, 'invite'), invites });
			expect(await gate({ email: undefined, inviteToken: made.token })).toBeNull();
		}
		const bare = createRegistration({ instance: fakeInstance('multi', 'invite') });
		expect(await bare({ email: undefined, inviteToken: made.token })).toBeNull();
	});

	it('is ignored when registration is open', async () => {
		const { gate, made } = await withInvite('open');
		expect(await gate({ email: undefined, inviteToken: made.token })).toEqual({});
	});
});
