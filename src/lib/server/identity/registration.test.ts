import { expect, it } from 'vitest';
import { createRegistration } from './registration.ts';
import { runAsFirstAdmin } from './setup.ts';

const attempt = { email: 'ada@example.com' };

it('refuses everyone outside createFirstAdmin', async () => {
	const admitSignUp = createRegistration();
	expect(await admitSignUp(attempt)).toBeNull();
});

it('admits the first admin onto the Local Learner as admin, only inside its scope', async () => {
	const admitSignUp = createRegistration();

	const inside = await runAsFirstAdmin(async () => admitSignUp(attempt));

	expect(inside).toEqual({ learnerId: 'local', role: 'admin' });
	expect(await admitSignUp(attempt)).toBeNull();
});

it('refuses a call made at the same time as, but outside, the first admin scope', async () => {
	const admitSignUp = createRegistration();
	const concurrent = Promise.resolve().then(() => admitSignUp(attempt));

	await runAsFirstAdmin(async () => {
		await new Promise((resolve) => setTimeout(resolve));
	});

	expect(await concurrent).toBeNull();
});
