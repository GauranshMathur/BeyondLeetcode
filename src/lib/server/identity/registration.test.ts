import { expect, it } from 'vitest';
import { createInstance } from '../instance.ts';
import { createFileTestDb } from '../test-db.ts';
import { type Admission, createAuth } from './auth.ts';
import { createRegistration } from './registration.ts';
import { createFirstAdmin } from './setup.ts';

const attempt = { email: 'ada@example.com' };

it('refuses everyone outside createFirstAdmin', async () => {
	expect(await createRegistration()(attempt)).toBeNull();
});

it('admits createFirstAdmin onto the Local Learner as admin, and nothing after it', async () => {
	const db = await createFileTestDb();
	const gate = createRegistration();
	const answers: (Admission | null)[] = [];
	const auth = createAuth({
		db,
		origin: 'http://localhost:3000',
		secret: 'test-secret-test-secret-test-secret-0123',
		admitSignUp: async (a) => {
			const answer = await gate(a);
			answers.push(answer);
			return answer;
		}
	});

	await createFirstAdmin(
		{ instance: await createInstance(db), auth, db },
		{ name: 'Ada', email: attempt.email, password: 'correct horse battery' }
	);

	expect(answers.length).toBeGreaterThan(0);
	expect(answers).toEqual(answers.map(() => ({ learnerId: 'local', role: 'admin' })));
	expect(await gate(attempt)).toBeNull();
});
