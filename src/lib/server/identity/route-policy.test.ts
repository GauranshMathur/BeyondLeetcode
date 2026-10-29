import { readdirSync } from 'node:fs';
import { dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { policyOf, type RoutePolicy } from './route-policy.ts';

const base = { multiOnly: false, noStore: false, bare: false } as const;
const publicMulti = { audience: 'public', multiOnly: true, noStore: false, bare: false } as const;

describe('policyOf', () => {
	it.each<[string | null, RoutePolicy]>([
		['/setup', { audience: 'setup', multiOnly: false, noStore: false, bare: true }],
		['/signin', { ...publicMulti, bare: true }],
		['/signup', { ...publicMulti, bare: true }],
		['/invite/[token]', { ...publicMulti, noStore: true, referrer: 'strict-origin', bare: true }],
		['/invite/other', { ...publicMulti, noStore: true, referrer: 'strict-origin', bare: true }],
		['/api/auth/[...all]', publicMulti],
		['/api/auth/x/y', publicMulti],
		['/users', { audience: 'admin', multiOnly: true, noStore: true, bare: false }],
		['/users/[id]', { audience: 'admin', multiOnly: true, noStore: true, bare: false }],
		['/account/password', { audience: 'signedIn', multiOnly: true, noStore: false, bare: false }]
	])('%s', (id, expected) => {
		expect(policyOf(id)).toEqual(expected);
	});

	it.each([
		null,
		'/',
		'/settings',
		'/problems/[problemId]',
		'/signinx',
		'/signin/x',
		'/setupx',
		'/usersx',
		'/invite',
		'/api/auth',
		'/api/authx',
		'/account',
		'/account/password/x'
	])('default for %s', (id) => {
		expect(policyOf(id)).toEqual({ audience: 'signedIn', ...base });
	});

	it('has no referrer key on the default', () => {
		expect('referrer' in policyOf('/')).toBe(false);
	});

	it('makes exactly /setup, /signin, /signup and /invite/[token] bare, of every route under src/routes', () => {
		const root = fileURLToPath(new URL('../../../routes', import.meta.url));
		const ids = [
			...new Set(
				readdirSync(root, { recursive: true, encoding: 'utf8' })
					.filter((file) => /(^|[\\/])\+(page|server)(\.server)?\.ts$|\+page\.svelte$/.test(file))
					.map((file) => `/${dirname(file).split(sep).join('/')}`.replace(/^\/\.$/, '/'))
			)
		].sort();
		expect(ids).toContain('/invite/[token]');
		expect(ids.filter((id) => policyOf(id).bare)).toEqual([
			'/invite/[token]',
			'/setup',
			'/signin',
			'/signup'
		]);
	});
});
