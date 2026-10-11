import { describe, expect, it } from 'vitest';
import { type GateInput, gate, safeNext } from './gate.ts';

const admin = { learnerId: 'a', displayName: 'Ada', role: 'admin' as const };
const learner = { learnerId: 'l', displayName: 'Lee', role: 'learner' as const };

const request = (routeId: string | null, extra: Partial<GateInput> = {}): GateInput => ({
	mode: 'multi',
	who: null,
	routeId,
	method: 'GET',
	pathname: routeId ?? '/nowhere',
	search: '',
	...extra
});

const pass = { kind: 'pass' } as const;
const redirect = (location: string) => ({ kind: 'redirect', status: 303, location }) as const;
const status = (code: 403 | 404) => ({ kind: 'status', status: code }) as const;

describe('gate', () => {
	const cases: [string, GateInput, ReturnType<typeof gate>][] = [
		// 1. not set up
		['not set up, home -> setup', request('/', { mode: null }), redirect('/setup')],
		[
			'not set up, problem -> setup',
			request('/problems/[slug]', { mode: null }),
			redirect('/setup')
		],
		['not set up, api -> setup', request('/api/auth/[...all]', { mode: null }), redirect('/setup')],
		['not set up, 404 -> setup', request(null, { mode: null }), redirect('/setup')],
		['not set up, /setup -> pass', request('/setup', { mode: null }), pass],
		// 2. set up, /setup
		['local, /setup -> home', request('/setup', { mode: 'local', who: admin }), redirect('/')],
		['multi, /setup -> home', request('/setup', { who: admin }), redirect('/')],
		['multi nobody, /setup -> home', request('/setup'), redirect('/')],
		[
			'local, /setup?convert -> pass',
			request('/setup', { mode: 'local', who: admin, search: '?convert' }),
			pass
		],
		[
			'local, /setup?convert=1 -> pass',
			request('/setup', { mode: 'local', who: admin, search: '?convert=1' }),
			pass
		],
		[
			'multi, /setup?convert -> home',
			request('/setup', { who: admin, search: '?convert' }),
			redirect('/')
		],
		[
			'local, /setup?other -> home',
			request('/setup', { mode: 'local', who: admin, search: '?other' }),
			redirect('/')
		],
		// 3. local mode hides account routes
		['local, /signin -> 404', request('/signin', { mode: 'local', who: admin }), status(404)],
		['local, /signup -> 404', request('/signup', { mode: 'local', who: admin }), status(404)],
		[
			'local, invite -> 404',
			request('/invite/[token]', { mode: 'local', who: admin }),
			status(404)
		],
		['local, /users -> 404', request('/users', { mode: 'local', who: admin }), status(404)],
		['local, /users/x -> 404', request('/users/[id]', { mode: 'local', who: admin }), status(404)],
		[
			'local, /account/password -> 404',
			request('/account/password', { mode: 'local', who: admin }),
			status(404)
		],
		[
			'local, /api/auth/x -> 404',
			request('/api/auth/[...all]', { mode: 'local', who: admin }),
			status(404)
		],
		['local, home -> pass', request('/', { mode: 'local', who: admin }), pass],
		[
			'local, set up lookalike /api/authx -> pass',
			request('/api/authx', { mode: 'local', who: admin }),
			pass
		],
		// 4. multi, nobody
		[
			'multi nobody, home -> signin with next',
			request('/', { pathname: '/', search: '' }),
			redirect('/signin?next=%2F')
		],
		[
			'multi nobody, problem keeps path and search',
			request('/problems/[slug]', { pathname: '/problems/two-sum', search: '?tab=notes&x=1' }),
			redirect('/signin?next=%2Fproblems%2Ftwo-sum%3Ftab%3Dnotes%26x%3D1')
		],
		['multi nobody, /signin -> pass', request('/signin'), pass],
		['multi nobody, /signup -> pass', request('/signup'), pass],
		['multi nobody, invite -> pass', request('/invite/[token]'), pass],
		['multi nobody, /api/auth/x -> pass', request('/api/auth/[...all]'), pass],
		[
			'multi nobody, /users -> signin',
			request('/users', { pathname: '/users' }),
			redirect('/signin?next=%2Fusers')
		],
		[
			'multi nobody, /account/password -> signin',
			request('/account/password', { pathname: '/account/password' }),
			redirect('/signin?next=%2Faccount%2Fpassword')
		],
		['multi nobody, 404 page -> pass', request(null), pass],
		// 5. must change password
		[
			'must change, home -> password',
			request('/', { who: learner, mustChangePassword: true }),
			redirect('/account/password')
		],
		[
			'must change, /users -> password',
			request('/users', { who: admin, mustChangePassword: true }),
			redirect('/account/password')
		],
		[
			'must change, /account/password -> pass',
			request('/account/password', { who: learner, mustChangePassword: true }),
			pass
		],
		[
			'must change, POST sign-out -> pass',
			request('/api/auth/[...all]', {
				who: learner,
				mustChangePassword: true,
				method: 'POST',
				pathname: '/api/auth/sign-out'
			}),
			pass
		],
		[
			'must change, other auth api -> password',
			request('/api/auth/[...all]', {
				who: learner,
				mustChangePassword: true,
				method: 'POST',
				pathname: '/api/auth/get-session'
			}),
			redirect('/account/password')
		],
		[
			'must change, 404 page -> pass',
			request(null, { who: learner, mustChangePassword: true }),
			pass
		],
		['signed in without the flag, home -> pass', request('/', { who: learner }), pass],
		[
			'local ignores the flag',
			request('/', { mode: 'local', who: admin, mustChangePassword: true }),
			pass
		],
		// 6. /users is admin only
		['learner, /users -> 403', request('/users', { who: learner }), status(403)],
		['learner, /users/x -> 403', request('/users/[id]', { who: learner }), status(403)],
		['admin, /users -> pass', request('/users', { who: admin }), pass],
		['learner, /usersX lookalike -> pass', request('/usersX', { who: learner }), pass],
		// 7. otherwise
		['multi learner, home -> pass', request('/', { who: learner }), pass],
		['multi learner, /signin -> pass', request('/signin', { who: learner }), pass],
		['multi admin, /account/password -> pass', request('/account/password', { who: admin }), pass]
	];

	it.each(cases)('%s', (_name, input, expected) => {
		expect(gate(input)).toEqual(expected);
	});

	it('first match wins: not set up beats local-mode 404', () => {
		expect(gate(request('/signin', { mode: null }))).toEqual(redirect('/setup'));
	});
});

describe('safeNext', () => {
	const cases: [string | null, string][] = [
		['/problems/two-sum', '/problems/two-sum'],
		['/problems/two-sum?tab=notes#top', '/problems/two-sum?tab=notes#top'],
		['/', '/'],
		[null, '/'],
		['', '/'],
		['problems', '/'],
		['//evil.com', '/'],
		['//evil.com/path', '/'],
		['/\\evil.com', '/'],
		['\\\\evil.com', '/'],
		['\\/evil.com', '/'],
		['https://evil.com', '/'],
		['http://evil.com/x', '/'],
		['javascript:alert(1)', '/'],
		['data:text/html,x', '/'],
		['/ok\nhttps://evil.com', '/'],
		['/ok\r\nSet-Cookie: a=b', '/'],
		['/ok\u0000', '/'],
		['/\t/evil.com', '/'],
		['/\u007f', '/'],
		[' /ok', '/'],
		['/ok ', '/ok ']
	];

	it.each(cases)('%j -> %j', (input, expected) => {
		expect(safeNext(input)).toBe(expected);
	});
});
