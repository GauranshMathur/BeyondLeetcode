/** Who may reach a route once the Instance is set up (`setup`: only while setting up or converting). */
export interface RoutePolicy {
	audience: 'public' | 'signedIn' | 'admin' | 'setup';
	/** Not found in Local Mode. */
	multiOnly: boolean;
	/** Answers carry `Cache-Control: no-store`. */
	noStore: boolean;
	referrer?: 'strict-origin';
	/** Shows the wordmark alone, with no Map link. */
	bare: boolean;
}

type Match = { exact: string } | { under: string } | { prefix: string };

const POLICIES: readonly { match: Match; policy: RoutePolicy }[] = [
	{
		match: { exact: '/setup' },
		policy: { audience: 'setup', multiOnly: false, noStore: false, bare: true }
	},
	{
		match: { exact: '/signin' },
		policy: { audience: 'public', multiOnly: true, noStore: false, bare: true }
	},
	{
		match: { exact: '/signup' },
		policy: { audience: 'public', multiOnly: true, noStore: false, bare: true }
	},
	{
		match: { prefix: '/invite/' },
		policy: {
			audience: 'public',
			multiOnly: true,
			noStore: true,
			referrer: 'strict-origin',
			bare: true
		}
	},
	{
		match: { prefix: '/api/auth/' },
		policy: { audience: 'public', multiOnly: true, noStore: false, bare: false }
	},
	{
		match: { under: '/users' },
		policy: { audience: 'admin', multiOnly: true, noStore: true, bare: false }
	},
	{
		match: { exact: '/account/password' },
		policy: { audience: 'signedIn', multiOnly: true, noStore: false, bare: false }
	}
];

const DEFAULT: RoutePolicy = {
	audience: 'signedIn',
	multiOnly: false,
	noStore: false,
	bare: false
};

const matches = (m: Match, id: string) =>
	'exact' in m
		? id === m.exact
		: 'prefix' in m
			? id.startsWith(m.prefix)
			: id === m.under || id.startsWith(`${m.under}/`);

/** The policy of a route id (SvelteKit's `event.route.id`); null, no route matched, gets the default. */
export function policyOf(routeId: string | null): RoutePolicy {
	if (routeId === null) return DEFAULT;
	return POLICIES.find((row) => matches(row.match, routeId))?.policy ?? DEFAULT;
}
