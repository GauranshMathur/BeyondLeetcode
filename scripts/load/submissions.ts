// Prints the Runner requests a Submission of every Problem sends, as JSON, for the load test.
// Run: bun scripts/load/submissions.ts [content-dir]   (default: content)
import { fileURLToPath } from 'node:url';
import { ContentError, loadCatalogue } from '../../src/lib/server/content/catalogue.ts';
import { runnerSubmissions } from '../../src/lib/server/load/submissions.ts';

const root = fileURLToPath(new URL('../..', import.meta.url));
const dir = process.argv[2] ?? `${root}content`;

try {
	const catalogue = await loadCatalogue(dir);
	process.stdout.write(`${JSON.stringify(runnerSubmissions(catalogue))}\n`);
} catch (error) {
	if (error instanceof ContentError) {
		for (const issue of error.issues) console.error(issue);
		process.exit(1);
	}
	throw error;
}
