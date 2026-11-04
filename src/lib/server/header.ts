import type { Identity } from './identity/index.js';
import { policyOf } from './identity/route-policy.js';
import type { InstanceMode } from './instance.js';

/** A link in the bar. `phoneLabel` is what it says below 768px (F.10f); `key` names it for styling. */
export interface HeaderLink {
	key: 'map' | 'users' | 'account';
	href: string;
	label: string;
	phoneLabel: string;
	current: boolean;
}

/** What the bar draws: the wordmark, the links, whether Sign out shows, and whether the wordmark stands alone. */
export interface Header {
	wordmark: { href: string; label: string; phoneLabel: string };
	/** The wordmark alone, with no links: before the Instance is set up or anyone is signed in. */
	bare: boolean;
	links: HeaderLink[];
	signOut: boolean;
}

export interface HeaderInput {
	/** Unset before the Instance is set up, and on the pages that open to visitors who are not signed in. */
	identity: Identity | undefined;
	mode: InstanceMode | null;
	routeId: string | null;
	pathname: string;
}

const WORDMARK = { href: '/', label: 'Beyond Leetcode', phoneLabel: 'BLC' } as const;

export function headerFor({ identity, mode, routeId, pathname }: HeaderInput): Header {
	if (policyOf(routeId).bare) {
		return { wordmark: WORDMARK, bare: true, links: [], signOut: false };
	}
	const multi = mode === 'multi';
	const link = (
		key: HeaderLink['key'],
		href: string,
		label: string,
		phoneLabel = label
	): HeaderLink => ({ key, href, label, phoneLabel, current: pathname === href });
	const links: HeaderLink[] = [link('map', '/', 'Map')];
	// Only the admin of a Multi-user Instance has Accounts to manage. The Local Learner is an admin
	// too, but Local Mode has no Accounts and no Users page.
	if (multi && identity?.role === 'admin') links.push(link('users', '/users', 'Users'));
	// The display name opens Settings; Local Mode's Identity names it "Local", and a phone says "Settings".
	links.push(
		link(
			'account',
			'/settings',
			identity?.displayName ?? '',
			mode === 'local' ? 'Settings' : undefined
		)
	);
	// Only a signed-in Account has a session to end. Local Mode has no accounts, so no Sign out.
	return { wordmark: WORDMARK, bare: false, links, signOut: multi && identity !== undefined };
}
