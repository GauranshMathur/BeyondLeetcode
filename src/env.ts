import { defineEnvVars } from '@sveltejs/kit/env';

// Each variable stays optional: createApp decides what an unset or empty one means (see its tests), so nothing is defaulted here.
export const variables = defineEnvVars({
	CONTENT_DIR: { schema: (input) => input },
	DATABASE_URL: { schema: (input) => input },
	RUNNER_URL: { schema: (input) => input },
	RUNNER_TOKEN: { schema: (input) => input },
	IDENTITY_TEST_LEARNER: { schema: (input) => input },
	RUNNER_ADAPTER: { schema: (input) => input },
	NODE_ENV: { schema: (input) => input },
	BETTER_AUTH_SECRET: { schema: (input) => input },
	ORIGIN: { schema: (input) => input }
});
