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
			'local, unknown page -> pass (the 404 page)',
			request(null, { mode: 'local', who: admin }),
			pass
		],
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
		// A path with no route is a private page: nobody learns from the 404 page which paths exist.
		[
			'multi nobody, unknown page -> signin with next',
			request(null, { pathname: '/no/such/page', search: '?a=1' }),
			redirect('/signin?next=%2Fno%2Fsuch%2Fpage%3Fa%3D1')
		],
		[
			'multi nobody, unknown page that merely looks like a public one -> signin',
			request(null, { pathname: '/signin/extra' }),
			redirect('/signin?next=%2Fsignin%2Fextra')
		],
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
		// /account/password has no route until its page lands; the user must not be sent round in a loop.
		[
			'must change, /account/password with no route yet -> pass (the 404 page, not a redirect to itself)',
			request(null, {
				who: learner,
				mustChangePassword: true,
				pathname: '/account/password'
			}),
			pass
		],
		[
			'must change, other path with no route -> password, even one that starts like it',
			request(null, {
				who: learner,
				mustChangePassword: true,
				pathname: '/account/password/extra'
			}),
			redirect('/account/password')
		],
		[
			'must change, /account/passwords with no route -> password',
			request(null, {
				who: learner,
				mustChangePassword: true,
				pathname: '/account/passwords'
			}),
			redirect('/account/password')
		],
		[
			'must change, unknown page -> password',
			request(null, { who: learner, mustChangePassword: true }),
			redirect('/account/password')
		],
		[
			'must change, POST Settings sign-out action -> pass',
			request('/settings', {
				who: learner,
				mustChangePassword: true,
				method: 'POST',
				pathname: '/settings',
				search: '?/signout'
			}),
			pass
		],
		[
			'must change, POST Settings data request with the sign-out action -> password',
			request('/settings', {
				who: learner,
				mustChangePassword: true,
				method: 'POST',
				pathname: '/settings/__data.json',
				search: '?/signout'
			}),
			redirect('/account/password')
		],
		[
			'must change, POST data request of a page that is not a folder -> password',
			request('/settings', {
				who: learner,
				mustChangePassword: true,
				method: 'POST',
				pathname: '/settings.html__data.json',
				search: '?/signout'
			}),
			redirect('/account/password')
		],
		[
			'must change, POST /api/auth/sign-out with a data suffix is no sign-out -> password',
			request('/api/auth/[...all]', {
				who: learner,
				mustChangePassword: true,
				method: 'POST',
				pathname: '/api/auth/sign-out/__data.json'
			}),
			redirect('/account/password')
		],
		[
			'must change, GET Settings sign-out -> password',
			request('/settings', {
				who: learner,
				mustChangePassword: true,
				pathname: '/settings',
				search: '?/signout'
			}),
			redirect('/account/password')
		],
		[
			'must change, POST Settings reset -> password',
			request('/settings', {
				who: learner,
				mustChangePassword: true,
				method: 'POST',
				pathname: '/settings',
				search: '?/reset'
			}),
			redirect('/account/password')
		],
		[
			'must change, POST Settings with the reset first and sign-out second -> password (SvelteKit runs the first)',
			request('/settings', {
				who: learner,
				mustChangePassword: true,
				method: 'POST',
				pathname: '/settings',
				search: '?/reset&/signout'
			}),
			redirect('/account/password')
		],
		[
			'must change, POST another page with a sign-out action -> password',
			request('/', {
				who: learner,
				mustChangePassword: true,
				method: 'POST',
				pathname: '/',
				search: '?/signout'
			}),
			redirect('/account/password')
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
		['multi learner, unknown page -> pass (the 404 page)', request(null, { who: learner }), pass],
		['multi admin, unknown page -> pass (the 404 page)', request(null, { who: admin }), pass],
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
		['/ok ', '/ok '],
		['/\\/evil.com', '/'],
		['/\\\\evil.com', '/'],
		['\\\\/evil.com', '/'],
		['\t//evil.com', '/'],
		['/\r/evil.com', '/'],
		['/\n/evil.com', '/'],
		['/\u0001', '/'],
		['/%2F/evil.com', '/%2F/evil.com'],
		['/%5Cevil.com', '/%5Cevil.com'],
		['/https://evil.com', '/https://evil.com'],
		['/@evil.com', '/@evil.com'],
		['HTTPS://evil.com', '/'],
		['mailto:a@b.c', '/'],
		['file:///etc/passwd', '/'],
		['//', '/'],
		['/?next=//evil.com', '/?next=//evil.com']
	];

	it.each(cases)('%j -> %j', (input, expected) => {
		expect(safeNext(input)).toBe(expected);
	});
});
