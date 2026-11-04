import { readdirSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { headerFor } from './header.ts';

const wordmark = { href: '/', label: 'Beyond Leetcode', phoneLabel: 'BLC' };
const local = { learnerId: 'l', displayName: 'Local', role: 'admin' } as const;
const learner = { learnerId: 'a', displayName: 'Ada', role: 'learner' } as const;
const admin = { learnerId: 'b', displayName: 'Root', role: 'admin' } as const;

describe('headerFor', () => {
	it('draws Local Mode with "Local" on a desktop, "Settings" on a phone, and no Users or Sign out', () => {
		expect(headerFor({ identity: local, mode: 'local', routeId: '/', pathname: '/' })).toEqual({
			wordmark,
			bare: false,
			inPage: false,
			links: [
				{ key: 'map', href: '/', label: 'Map', phoneLabel: 'Map', current: true },
				{
					key: 'account',
					href: '/settings',
					label: 'Local',
					phoneLabel: 'Settings',
					current: false
				}
			],
			signOut: false
		});
	});

	it('draws a Multi-user learner with their name on both, Sign out, and no Users', () => {
		const header = headerFor({
			identity: learner,
			mode: 'multi',
			routeId: '/settings',
			pathname: '/settings'
		});
		expect(header.links).toEqual([
			{ key: 'map', href: '/', label: 'Map', phoneLabel: 'Map', current: false },
			{ key: 'account', href: '/settings', label: 'Ada', phoneLabel: 'Ada', current: true }
		]);
		expect(header.signOut).toBe(true);
		expect(header.bare).toBe(false);
	});

	it('adds Users for the admin of a Multi-user Instance, marked on /users', () => {
		const header = headerFor({
			identity: admin,
			mode: 'multi',
			routeId: '/users',
			pathname: '/users'
		});
		expect(header.links.map((l) => [l.key, l.current])).toEqual([
			['map', false],
			['users', true],
			['account', false]
		]);
		expect(header.links[1]).toMatchObject({ href: '/users', label: 'Users', phoneLabel: 'Users' });
		expect(header.signOut).toBe(true);
	});

	it('does not offer Users in Local Mode, where the Local Learner is an admin', () => {
		const links = headerFor({ identity: local, mode: 'local', routeId: '/', pathname: '/' }).links;
		expect(links.map((l) => l.key)).toEqual(['map', 'account']);
	});

	it('does not draw a Multi-user page with nobody signed in as Local', () => {
		const header = headerFor({ identity: undefined, mode: 'multi', routeId: '/', pathname: '/' });
		const account = header.links.find((l) => l.key === 'account');
		expect(account?.phoneLabel).toBe(account?.label);
		expect(account?.phoneLabel).not.toBe('Settings');
		expect(header.signOut).toBe(false);
		expect(header.links.some((l) => l.key === 'users')).toBe(false);
	});

	it('draws a page that is not found with the full header', () => {
		expect(
			headerFor({ identity: learner, mode: 'multi', routeId: null, pathname: '/nope' }).bare
		).toBe(false);
	});

	it('puts the Problem route in the page: its screen draws the bar', () => {
		const at = (routeId: string | null) =>
			headerFor({ identity: learner, mode: 'multi', routeId, pathname: '/x' }).inPage;
		expect(at('/problems/[problemId]')).toBe(true);
		for (const routeId of ['/', '/topics/[topicId]', '/chapters/[chapterId]', '/settings', null])
			expect([routeId, at(routeId)]).toEqual([routeId, false]);
	});

	// Today's layout listed exactly these four; the route-policy table must give the same answers.
	it.each(['/setup', '/signin', '/signup', '/invite/[token]'])(
		'%s is bare: the wordmark alone',
		(routeId) => {
			for (const [identity, mode] of [
				[undefined, 'multi'],
				[undefined, null],
				[local, 'local'],
				[learner, 'multi']
			] as const) {
				expect(headerFor({ identity, mode, routeId, pathname: '/x' })).toEqual({
					wordmark,
					bare: true,
					inPage: false,
					links: [],
					signOut: false
				});
			}
		}
	);

	it("is bare on exactly today's routes, across every route id in src/routes", () => {
		const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'routes');
		const ids: string[] = [];
		const walk = (dir: string) => {
			const entries = readdirSync(dir, { withFileTypes: true });
			if (entries.some((e) => /^\+(page|server)/.test(e.name))) {
				const rel = dir.slice(root.length).split(sep).join('/');
				ids.push(rel === '' ? '/' : rel);
			}
			for (const e of entries) if (e.isDirectory()) walk(join(dir, e.name));
		};
		walk(root);
		expect(ids.length).toBeGreaterThan(8);
		const TODAY = new Set(['/setup', '/signin', '/signup', '/invite/[token]']);
		for (const routeId of ids) {
			const bare = headerFor({ identity: learner, mode: 'multi', routeId, pathname: '/' }).bare;
			expect([routeId, bare]).toEqual([routeId, TODAY.has(routeId)]);
		}
	});
});
