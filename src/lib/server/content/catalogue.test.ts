import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadCatalogue } from './catalogue.ts';

const fixtureDir = fileURLToPath(new URL('./fixture', import.meta.url));

describe('fixture content', () => {
	it('lists the Topic Map in order with Prerequisites', async () => {
		const catalogue = await loadCatalogue(fixtureDir);

		expect(catalogue.topicMap().map((t) => [t.id, t.prerequisites])).toEqual([
			['stacks', []],
			['queues', ['stacks']],
			['heaps', ['stacks', 'queues']]
		]);
	});
});
