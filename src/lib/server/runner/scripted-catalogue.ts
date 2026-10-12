import type { Catalogue } from '../content/catalogue.ts';
import { createScriptedRunner, type RunnerScript, type ScriptedTest } from './fake.ts';
import type { ExecuteRequest, RunnerPort } from './port.ts';

/** `<problemId>/<kind>/<name>` (see Test.id in the catalogue). */
const problemOf = (testId: string) => testId.split('/')[0];

const sameFiles = (a: Record<string, string>, b: Record<string, string>) =>
	JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());

/**
 * Runner adapter for the screen e2e suite: the scripted fake, with its script worked out per request
 * from the submitted files and the catalogue. It never runs code.
 *  - the Reference Code of a Problem (any Language) → its Tests, and those of the Core Problems before
 *    it in the Topic, print their expected output (a Build carries the earlier steps);
 *  - Python `def (` → compile error; `raise Name("msg")` → runtime error `Name: msg`;
 *  - `print(<literal>)` → every Test prints the literal;
 *  - anything else → every Test is ok with empty output.
 */
export function createCatalogueScriptedRunner(catalogue: Catalogue): RunnerPort {
	const expectedOf = (testId: string) => {
		const problemId = problemOf(testId);
		const tests = [
			...(catalogue.problem(problemId)?.exampleTests ?? []),
			...(catalogue.hiddenTests(problemId) ?? [])
		];
		return tests.find((test) => test.id === testId)?.expected ?? '';
	};
	/** The Problem whose Reference Code these files are, among the Problems the request tests. */
	const referenceOf = (request: ExecuteRequest) =>
		[...new Set(request.tests.map(({ id }) => problemOf(id)))].find((id) => {
			const reference = catalogue.problem(id)?.referenceCode[request.language];
			return reference !== undefined && sameFiles({ ...reference }, request.files);
		});
	/** Whether a build that is Problem `built`'s Reference Code solves Problem `id`. */
	const solves = (built: string, id: string) => {
		if (built === id) return true;
		const mainLine = catalogue.topic(catalogue.problem(built)?.topicId ?? '')?.mainLine ?? [];
		const at = mainLine.indexOf(id);
		return at !== -1 && at < mainLine.indexOf(built);
	};

	function scriptFor(request: ExecuteRequest): RunnerScript {
		const source = Object.values(request.files).join('\n');
		const tests = (make: (id: string) => ScriptedTest) =>
			Object.fromEntries(request.tests.map(({ id }) => [id, make(id)]));
		const built = referenceOf(request);
		if (built !== undefined) {
			return {
				tests: tests((id) => ({
					status: 'ok',
					stdout: solves(built, problemOf(id)) ? expectedOf(id) : ''
				}))
			};
		}
		if (/^def \(/m.test(source)) return { compileError: 'SyntaxError: invalid syntax' };
		const raised = /^raise (\w+)\("(.*)"\)/m.exec(source);
		if (raised) {
			return {
				tests: tests(() => ({ status: 'runtimeError', stderr: `${raised[1]}: ${raised[2]}\n` }))
			};
		}
		const printed = /^print\((.*)\)[ \t]*$/m.exec(source);
		if (printed) return { tests: tests(() => ({ status: 'ok', stdout: `${printed[1]}\n` })) };
		return {};
	}

	return { execute: (request) => createScriptedRunner(scriptFor(request)).execute(request) };
}
