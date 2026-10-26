/**
 * ORIGIN as an http(s) origin, or null when it is unset or not a URL (a bare `http://` is not one).
 * Both callers read the same value: the app treats null as "missing" and the reset command passes `?? ''`.
 */
export function parseOrigin(value: string | undefined): string | null {
	try {
		const url = new URL(value ?? '');
		return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : null;
	} catch {
		return null;
	}
}
