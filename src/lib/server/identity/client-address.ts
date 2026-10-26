import type { RequestEvent } from '@sveltejs/kit';

/** The caller's address, or '' when the server cannot tell: the throttle keeps those in one shared bucket. */
export function clientAddress(event: Pick<RequestEvent, 'getClientAddress'>): string {
	try {
		return event.getClientAddress();
	} catch {
		return '';
	}
}
