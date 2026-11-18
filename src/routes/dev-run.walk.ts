import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Browser, expect, type Locator, type Page, test } from '@playwright/test';
import { phone, workspaceTab } from '../lib/e2e-phone.ts';
import { LANGUAGES } from '../lib/languages.ts';
import { gotoHydrated, reloadHydrated } from '../lib/test/hydrated.ts';

// The walk .github/dev-run.sh runs against a real Local Instance: the built server, the real Runner and the real
// content folder, started as docs/self-hosting.md says ("From a clone"). It sets no test cookie: it acts as the
// Instance's one Local Learner. The script runs one group at a time, picking it with the tag in its title:
//   @setup    the Instance chooses Local mode (the server runs without the switch)
//   @dev-on   the server runs with DEV_MODE=1
//   @dev-off  the server runs again without it
//
// What it works on is read from the content folder on disk, never named here, because the content sprints
// rewrite Topics. Every edit it makes to the content folder is put back in a finally.
const baseURL = process.env.DEV_RUN_BASE_URL ?? '';
const out = process.env.DEV_RUN_OUT ?? 'dev-run-out';
const contentDir = process.env.DEV_RUN_CONTENT ?? 'content';

const slow = { timeout: 180_000 };

// Set by the script when the Runner never got ready: the tests that need it are skipped, so the record says
// "not reached" for them instead of reading as findings about dev mode.
const noRunner = process.env.DEV_RUN_NO_RUNNER === '1';
const needsRunner = () => test.skip(noRunner, 'the Runner was not ready');

type Json = Record<string, unknown>;
const readJson = (...parts: string[]) =>
	JSON.parse(readFileSync(join(contentDir, ...parts), 'utf8')) as Json;
const strings = (value: unknown): string[] =>
	Array.isArray(value) && value.every((v) => typeof v === 'string') ? (value as string[]) : [];

type Core = { topic: string; chapter: string; problem: string; title: string; dir: string };

/** A Topic's Core Problems on its Main Line: its Chapters in order, each Chapter's Problems in order. */
function coreProblems(topic: string): Core[] {
	const found: Core[] = [];
	for (const chapter of strings(readJson('topics', topic, 'topic.json').chapters)) {
		const chapterDir = ['topics', topic, 'chapters', chapter];
		for (const problem of strings(readJson(...chapterDir, 'chapter.json').problems)) {
			const dir = join(...chapterDir, 'problems', problem);
			const json = readJson(dir, 'problem.json');
			if (json.kind === 'core')
				found.push({ topic, chapter, problem, title: String(json.title), dir });
		}
	}
	return found;
}

/** The file names without their extension, sorted, of a Test folder's `.in` files. */
const testNames = (dir: string, kind: 'example' | 'hidden') =>
	readdirSync(join(contentDir, dir, 'tests', kind))
		.filter((name) => name.endsWith('.in'))
		.map((name) => name.slice(0, -'.in'.length))
		.sort();

function choose() {
	const topics = strings(readJson('content.json').topics);
	if (topics.length === 0) throw new Error('content.json lists no Topic');
	const last = topics[topics.length - 1] as string;
	if (strings(readJson('topics', last, 'topic.json').prerequisites).length === 0)
		throw new Error(
			`The last Topic, ${last}, lists no Prerequisite, so it is not Locked without dev mode`
		);
	const cores = coreProblems(last);
	if (cores.length < 2)
		throw new Error(`The last Topic, ${last}, has fewer than two Core Problems`);
	const first = coreProblems(topics[0] as string)[0];
	if (!first) throw new Error(`The first Topic, ${topics[0]}, has no Core Problem`);
	return { chosen: cores[1] as Core, before: cores[0] as Core, first };
}

const { chosen, before, first } = choose();
const chosenTests = {
	example: testNames(chosen.dir, 'example'),
	hidden: testNames(chosen.dir, 'hidden')
};
const beforeTests = {
	example: testNames(before.dir, 'example'),
	hidden: testNames(before.dir, 'hidden')
};
const ownRows = chosenTests.example.length + chosenTests.hidden.length;
const earlierRows = beforeTests.example.length + beforeTests.hidden.length;
const problemJson = join(contentDir, chosen.dir, 'problem.json');
const problemPath = `${chosen.dir}/problem.json`;

type Theme = 'light' | 'dark';
type Size = 'desktop' | 'phone';
const themes: Theme[] = ['light', 'dark'];
const sizes: Size[] = ['desktop', 'phone'];

const band = (page: Page) => page.getByRole('region', { name: 'Dev mode', exact: true });
const devButton = (page: Page) => page.getByRole('button', { name: 'Dev', exact: true });
const devBand = (page: Page) =>
	page.getByRole('region', { name: 'Dev mode: run the reference solution', exact: true });
const view = (page: Page) => page.locator('.dev');
const status = (page: Page) => view(page).getByRole('status');
const results = (page: Page, language: string, size: Size = 'desktop') =>
	size === 'phone'
		? view(page).getByRole('list', { name: `Reference solution results, ${language}` })
		: view(page).getByRole('table', { name: `Reference solution results, ${language}` });

/** Each row of a results table as its cells joined by " · ". */
const rowsOf = (table: Locator) =>
	table.locator('tbody tr').evaluateAll((rows) =>
		rows.map((row) =>
			Array.from(row.children)
				.map((cell) => cell.textContent?.trim())
				.join(' · ')
		)
	);

async function openDev(page: Page, path: string, size: Size = 'desktop') {
	await gotoHydrated(page, path);
	if (size === 'phone') await workspaceTab(page, 'Tests').click();
	await devButton(page).click();
	await expect(devButton(page)).toHaveAttribute('aria-pressed', 'true');
}

async function runReference(
	page: Page,
	language: (typeof LANGUAGES)[number],
	size: Size = 'desktop'
) {
	await devBand(page)
		.getByRole('combobox', { name: 'reference language', exact: true })
		.selectOption(language.id);
	await devBand(page)
		.getByRole('button', { name: /^Run(ning)? reference/ })
		.click();
	await expect(results(page, language.name, size)).toBeVisible(slow);
}

/** A fresh browser context of this size, with the `theme` cookie set as dev-mode.dev.e2e.ts sets it. */
async function inContext(
	browser: Browser,
	size: Size,
	theme: Theme,
	body: (page: Page) => Promise<void>
) {
	const context = await browser.newContext({
		baseURL,
		...(size === 'phone' ? phone : { viewport: { width: 1440, height: 900 } })
	});
	try {
		await context.addCookies([{ name: 'theme', value: theme, url: baseURL }]);
		const page = await context.newPage();
		await body(page);
	} finally {
		await context.close();
	}
}

async function shoot(page: Page, screen: string, theme: Theme, size: Size) {
	mkdirSync(out, { recursive: true });
	await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
	await page.screenshot({ path: join(out, `${screen}-${theme}-${size}.png`), fullPage: true });
}

/**
 * Edits one file of the content folder for the body of the test and puts the bytes back afterwards, whatever
 * the outcome. `restore` puts it back early, for a test that checks the answer after the file is back.
 */
async function withEdit(
	file: string,
	edit: (original: string) => string,
	body: (restore: () => void) => Promise<void>
) {
	const original = readFileSync(file);
	const restore = () => writeFileSync(file, original);
	try {
		writeFileSync(file, edit(original.toString('utf8')));
		await body(restore);
	} finally {
		restore();
	}
}

function writeTimings(group: string, values: Record<string, number[]>) {
	mkdirSync(out, { recursive: true });
	writeFileSync(join(out, `timings-${group}.json`), `${JSON.stringify(values, null, 2)}\n`);
}

/** `count` GETs of one page, one at a time, each read to its end. Milliseconds. */
async function timeGets(path: string, count: number) {
	const durations: number[] = [];
	for (let i = 0; i < count; i++) {
		const started = performance.now();
		const response = await fetch(new URL(path, baseURL));
		await response.arrayBuffer();
		durations.push(performance.now() - started);
		expect(response.status).toBe(200);
	}
	return durations;
}

const unique = (what: string) => `devrun-${what}-${Date.now().toString(36)}`;

test.describe('setup @setup', () => {
	test('a fresh Instance chooses Local mode at Setup', async ({ page }) => {
		// What the walk works on is kept for the script, which checks the web log against it.
		mkdirSync(out, { recursive: true });
		writeFileSync(
			join(out, 'chosen.json'),
			`${JSON.stringify({ problem: chosen.problem, problemJson: problemPath, routeId: '/problems/[problemId]' }, null, 2)}\n`
		);
		await gotoHydrated(page, '/');
		await expect(page).toHaveURL(/\/setup$/);
		await page.getByRole('button', { name: 'Start in Local mode →' }).click();
		await expect(page).toHaveURL(new URL('/', baseURL).href);
	});
});

test.describe('dev mode on @dev-on', () => {
	test('1. the band is on the Map and the last Topic’s second Core Problem opens', async ({
		page
	}) => {
		expect((await gotoHydrated(page, '/'))?.status()).toBe(200);
		await expect(band(page)).toBeVisible();
		await expect(band(page)).toContainText('Everything is unlocked.');
		const response = await gotoHydrated(page, `/problems/${chosen.problem}`);
		expect(response?.status()).toBe(200);
		await expect(page.getByRole('heading', { level: 1 })).toHaveText(chosen.title);
		await expect(page.getByText('This Topic is locked.')).toHaveCount(0);
	});

	test('2. Run reference solution passes in Python, TypeScript and Go, one row per Test', async ({
		page
	}) => {
		needsRunner();
		await openDev(page, `/problems/${chosen.problem}`);
		for (const language of LANGUAGES) {
			await runReference(page, language);
			const rows = await rowsOf(results(page, language.name));
			expect(rows).toHaveLength(ownRows + earlierRows);
			expect(rows.filter((row) => row.startsWith(`${before.problem} · `))).toHaveLength(
				earlierRows
			);
			expect(rows.every((row) => row.endsWith(' · pass'))).toBe(true);
			await expect(status(page)).toContainText('Reference passed');
		}
	});

	test('3. a Chapter edit shows on the next reload', async ({ page }) => {
		const marker = unique('chapter');
		// Opened first, so the edit is seen by a reload of a page already open.
		expect((await gotoHydrated(page, `/chapters/${chosen.chapter}`))?.status()).toBe(200);
		await expect(page.locator('main')).not.toContainText(marker);
		await withEdit(
			join(contentDir, 'topics', chosen.topic, 'chapters', chosen.chapter, 'chapter.md'),
			(text) => `${text}\n\n${marker}\n`,
			async () => {
				expect((await reloadHydrated(page))?.status()).toBe(200);
				await expect(page.locator('main')).toContainText(marker);
			}
		);
	});

	test('4. a Test edit makes the reference fail, and putting it back makes it pass', async ({
		page
	}) => {
		needsRunner();
		const name = chosenTests.hidden[0] as string;
		const python = LANGUAGES[0];
		await withEdit(
			join(contentDir, chosen.dir, 'tests', 'hidden', `${name}.out`),
			(text) => `${text}\ndevrun-wrong-answer\n`,
			async (restore) => {
				await openDev(page, `/problems/${chosen.problem}`);
				await runReference(page, python);
				expect(await rowsOf(results(page, python.name))).toContain(
					`${name} · Hidden · fail · wrong answer`
				);
				await expect(status(page)).toContainText('Reference failed');
				restore();
				await openDev(page, `/problems/${chosen.problem}`);
				await runReference(page, python);
				await expect(status(page)).toContainText('Reference passed');
			}
		);
	});

	test('5. a Reference Code edit shows on the Solution tab', async ({ page }) => {
		const marker = unique('reference');
		await withEdit(
			join(contentDir, chosen.dir, 'reference', 'python', 'main.py'),
			(text) => `${text}\n# ${marker}\n`,
			async () => {
				expect(
					(await gotoHydrated(page, `/problems/${chosen.problem}?tab=solution`))?.status()
				).toBe(200);
				await page
					.getByRole('navigation', { name: 'Reference code language' })
					.getByRole('button', { name: 'Python' })
					.click();
				// The editor draws only the lines in view, so the last one is scrolled to.
				await page.locator('.reference-slot .cm-scroller').evaluate((el) => {
					el.scrollTop = el.scrollHeight;
				});
				await expect(page.locator('.reference-slot .cm-content')).toContainText(marker);
			}
		);
	});

	test('6. a broken file answers Invalid content, and putting it back opens the Problem again', async ({
		browser,
		page
	}) => {
		await withEdit(
			problemJson,
			() => '{',
			async (restore) => {
				const response = await gotoHydrated(page, `/problems/${chosen.problem}`);
				expect(response?.status()).toBe(500);
				await expect(page.getByRole('heading', { level: 1 })).toHaveText('Invalid content');
				const issues = await page.locator('.issues li').allTextContents();
				expect(issues.some((line) => line.startsWith(problemPath))).toBe(true);
				for (const theme of themes) {
					for (const size of sizes) {
						await inContext(browser, size, theme, async (shown) => {
							const again = await gotoHydrated(shown, `/problems/${chosen.problem}`);
							expect(again?.status()).toBe(500);
							await expect(shown.getByRole('heading', { level: 1 })).toHaveText('Invalid content');
							await shoot(shown, 'invalid-content', theme, size);
						});
					}
				}
				restore();
				const fixed = await page.reload();
				expect(fixed?.status()).toBe(200);
				await expect(page.getByRole('heading', { level: 1 })).toHaveText(chosen.title);
			}
		);
	});

	test('7. screenshots of the Map and the Dev view, in both themes and both sizes', async ({
		browser
	}) => {
		needsRunner();
		for (const theme of themes) {
			for (const size of sizes) {
				await inContext(browser, size, theme, async (page) => {
					expect((await gotoHydrated(page, '/'))?.status()).toBe(200);
					await expect(band(page)).toBeVisible();
					await shoot(page, 'map', theme, size);
					await openDev(page, `/problems/${chosen.problem}`, size);
					await runReference(page, LANGUAGES[0], size);
					await expect(status(page)).toContainText('Reference passed');
					await shoot(page, 'problem-dev', theme, size);
				});
			}
		}
	});

	test('8. timings: 20 reads of a Problem, five autosaves', async ({ page }) => {
		const reads = await timeGets(`/problems/${first.problem}`, 20);
		writeTimings('dev-on', { reads });
		await gotoHydrated(page, `/problems/${chosen.problem}`);
		const editor = page.getByLabel('Code: main.py');
		await editor.click();
		await expect(editor).toBeFocused();
		const autosaves: number[] = [];
		for (let i = 0; i < 5; i++) {
			const started = performance.now();
			const saved = page.waitForResponse(
				(r) => r.request().method() === 'POST' && r.url().endsWith('?/save')
			);
			await page.keyboard.type('#');
			await saved;
			await expect(page.locator('.status:visible')).toHaveText('saved');
			autosaves.push(performance.now() - started);
		}
		writeTimings('dev-on', { reads, autosaves });
	});
});

test.describe('dev mode off @dev-off', () => {
	test('the band is gone and the last Topic is Locked again', async ({ page }) => {
		expect((await gotoHydrated(page, '/'))?.status()).toBe(200);
		await expect(band(page)).toHaveCount(0);
		const response = await gotoHydrated(page, `/problems/${chosen.problem}`);
		expect(response?.status()).toBe(403);
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('This Topic is locked.');
	});

	test('the first Topic’s first Core Problem has no Dev item', async ({ page }) => {
		const response = await gotoHydrated(page, `/problems/${first.problem}`);
		expect(response?.status()).toBe(200);
		await expect(page.getByRole('heading', { level: 1 })).toHaveText(first.title);
		await expect(page.getByLabel(/^Code: /)).toBeVisible();
		await expect(devButton(page)).toHaveCount(0);
	});

	test('timings: 20 reads of a Problem', async () => {
		writeTimings('dev-off', { reads: await timeGets(`/problems/${first.problem}`, 20) });
	});
});
