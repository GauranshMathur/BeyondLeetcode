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

	it('makes exactly /setup, /signin, /signup and /invite/[token] bare', () => {
		const ids = [
			'/setup',
			'/signin',
			'/signup',
			'/invite/[token]',
			'/api/auth/[...all]',
			'/users',
			'/account/password',
			'/',
			'/settings',
			'/problems/[problemId]',
			null
		];
		expect(ids.filter((id) => policyOf(id).bare)).toEqual([
			'/setup',
			'/signin',
			'/signup',
			'/invite/[token]'
		]);
	});
});
