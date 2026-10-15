import { isRedirect } from '@sveltejs/kit';
import { expect, it, vi } from 'vitest';
import { createInstance } from '$lib/server/instance';
import { createTestDb } from '$lib/server/test-db';
import { actions } from './+page.server';

async function choose(mode: string, chooseLocal: () => Promise<void>) {
	const body = new FormData();
	body.set('mode', mode);
	const event = {
		request: { formData: async () => body },
		locals: { instance: { chooseLocal } }
	};
	try {
		return await actions.default(event as never);
	} catch (thrown) {
		if (isRedirect(thrown)) return thrown;
		throw thrown;
	}
}

it('choosing Local sets the Instance up and redirects to the Map', async () => {
	const chooseLocal = vi.fn(async () => {});

	const result = await choose('local', chooseLocal);

	expect(chooseLocal).toHaveBeenCalledOnce();
	expect(result).toMatchObject({ status: 303, location: '/' });
});

it('a choice that lost the race to another one also redirects to the Map', async () => {
	const instance = await createInstance(await createTestDb());
	await instance.chooseLocal();

	const result = await choose('local', () => instance.chooseLocal());

	expect(result).toMatchObject({ status: 303, location: '/' });
});

it('any other failure is not hidden behind a redirect', async () => {
	await expect(choose('local', async () => Promise.reject(new Error('disk full')))).rejects.toThrow(
		'disk full'
	);
});

it('Multi-user cannot be chosen yet: nothing is set up', async () => {
	const chooseLocal = vi.fn(async () => {});

	const result = await choose('multi', chooseLocal);

	expect(result).toMatchObject({ status: 400 });
	expect(chooseLocal).not.toHaveBeenCalled();
});
