/** Test-only: the cookie that names the Learner an e2e file acts as (honoured only when Identity's gate is on). */
export const TEST_LEARNER_COOKIE = 'test_learner';

/** Playwright `storageState` that makes a browser context act as its own Learner. */
export function asLearner(learnerId: string) {
	return {
		cookies: [
			{
				name: TEST_LEARNER_COOKIE,
				value: learnerId,
				domain: 'localhost',
				path: '/',
				expires: -1,
				httpOnly: false,
				secure: false,
				sameSite: 'Lax' as const
			}
		],
		origins: []
	};
}
