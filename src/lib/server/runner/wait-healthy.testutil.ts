import { sandboxConfig } from './config';

/** Test-only: wait for a Runner process to answer `/health` 200 with the given Languages ready. Shared by every sandbox test. */

/** A cold CI machine pulls the Sandbox image before the Runner reports ready. */
export const healthBudgetMs = 60_000;

/** Polls until 200 listing every one of `languages` (default: all) and returns every status seen on the way (503 while the image pulls). */
export async function waitUntilHealthy(
	url: string,
	token: string,
	{
		intervalMs = 100,
		languages = Object.keys(sandboxConfig.images)
	}: { intervalMs?: number; languages?: string[] } = {}
): Promise<number[]> {
	const seen: number[] = [];
	const deadline = Date.now() + healthBudgetMs;
	while (Date.now() < deadline) {
		try {
			const res = await fetch(`${url}/health`, { headers: { Authorization: `Bearer ${token}` } });
			seen.push(res.status);
			if (res.status === 200) {
				const body = (await res.json()) as { languages?: string[] };
				if (languages.every((language) => body.languages?.includes(language))) return seen;
			}
		} catch {
			// not listening yet
		}
		await new Promise((resolve) => setTimeout(resolve, intervalMs));
	}
	throw new Error(`Runner process did not become healthy within ${healthBudgetMs / 1000} s`);
}
