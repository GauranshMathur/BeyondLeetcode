import { describe, expect, it, vi } from 'vitest';
import { ACCOUNT_FORM_ANSWERS, answerRefusal, signUpFromForm } from './account-forms.js';
import { type AccountActions, REFUSAL_CODES } from './identity/account-actions.js';

const typed = { name: 'Ada', email: 'ada@example.com' };

describe('the answer for every refusal code', () => {
	it('has an entry for each code, null for one the forms never meet', () => {
		expect(Object.keys(ACCOUNT_FORM_ANSWERS).sort()).toEqual([...REFUSAL_CODES].sort());
	});

	it('answers a code with no text as the generic failure', () => {
		const result = answerRefusal({ setHeaders: vi.fn() }, typed, { refused: 'SIGN_UP_FAILED' });

		expect(result).toMatchObject({
			status: 500,
			data: { ...typed, message: 'The account could not be created. Try again.' }
		});
	});

	it('keeps the status, text and field of a field refusal, and the typed values', () => {
		const result = answerRefusal({ setHeaders: vi.fn() }, typed, {
			refused: 'PASSWORD_TOO_SHORT',
			field: 'password'
		});

		expect(result).toMatchObject({
			status: 400,
			data: { ...typed, field: 'password', message: 'Use at least 12 characters.' }
		});
		expect(Object.keys(result.data)).not.toContain('password');
	});

	it('sets retry-after for too many attempts, at least one second', () => {
		const setHeaders = vi.fn();

		const result = answerRefusal({ setHeaders }, typed, { refused: 'TOO_MANY_ATTEMPTS' });

		expect(result.status).toBe(429);
		expect(setHeaders).toHaveBeenCalledWith({ 'retry-after': '1' });
		answerRefusal({ setHeaders }, typed, { refused: 'TOO_MANY_ATTEMPTS', retryAfterSeconds: 42 });
		expect(setHeaders).toHaveBeenLastCalledWith({ 'retry-after': '42' });
	});

	it('sets no header for any other refusal', () => {
		const setHeaders = vi.fn();

		answerRefusal({ setHeaders }, typed, { refused: 'EMAIL_UNAVAILABLE' });

		expect(setHeaders).not.toHaveBeenCalled();
	});
});

describe('signUpFromForm', () => {
	const form = (values: Record<string, string>) => {
		const body = new FormData();
		for (const [key, value] of Object.entries(values)) body.set(key, value);
		return body;
	};

	it('hands the fields to the sign-up and gives back what was typed, never the password', async () => {
		const signUp = vi.fn(async ({ fields }: Parameters<AccountActions['signUp']>[0]) => {
			expect(await fields()).toEqual({ ...typed, password: 'pw' });
			return { cookies: ['a=b'] };
		});

		const outcome = await signUpFromForm({ signUp } as never, {
			request: { formData: async () => form({ ...typed, password: 'pw' }) } as never,
			address: '203.0.113.7',
			invite: 'tok'
		});

		expect(outcome).toEqual({ typed, result: { cookies: ['a=b'] } });
		expect(JSON.stringify(outcome)).not.toContain('pw');
		expect(signUp).toHaveBeenCalledWith(expect.objectContaining({ invite: 'tok' }));
	});

	it('answers a body that is not a form as unreadable, with nothing of it kept', async () => {
		const signUp = vi.fn(async ({ fields }: Parameters<AccountActions['signUp']>[0]) => {
			await fields();
			return { cookies: [] };
		});

		const outcome = await signUpFromForm({ signUp } as never, {
			request: {
				formData: async () => {
					throw new TypeError('Failed to parse body');
				}
			} as never,
			address: '203.0.113.7'
		});

		expect(outcome).toEqual({ unreadable: true });
	});

	it('lets any other error through', async () => {
		const signUp = vi.fn(async () => {
			throw new Error('boom');
		});

		await expect(
			signUpFromForm({ signUp } as never, {
				request: { formData: async () => form({}) } as never,
				address: 'x'
			})
		).rejects.toThrow('boom');
	});
});
