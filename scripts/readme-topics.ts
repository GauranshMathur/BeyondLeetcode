// Rewrites the Topics table in README.md from content/. Run: bun scripts/readme-topics.ts
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadCatalogue } from '../src/lib/server/content/catalogue.ts';
import {
	readmeTopicsTable,
	replaceBetweenMarkers
} from '../src/lib/server/content/readme-topics.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const readmePath = `${root}README.md`;

const catalogue = await loadCatalogue(`${root}content`);
const before = await readFile(readmePath, 'utf8');
const after = replaceBetweenMarkers(before, readmeTopicsTable(catalogue));
if (after === before) {
	console.log('README.md Topics table is up to date.');
} else {
	await writeFile(readmePath, after);
	console.log('README.md Topics table updated.');
}
