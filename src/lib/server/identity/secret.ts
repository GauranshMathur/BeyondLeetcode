export const MIN_SECRET_LENGTH = 32;

/** The secret Better Auth falls back to when none is set (`utils/constants` in better-auth 1.7.x). */
const BETTER_AUTH_DEFAULT_SECRET = 'better-auth-secret-12345678901234567890';

/**
 * A secret everyone can read: Better Auth's built-in default, or the `change-me...` placeholder that
 * `.env.example` ships (it is long enough to pass the length check). Signing sessions with either
 * lets anyone forge them, so it is treated like no secret at all.
 */
export function isPlaceholderSecret(secret: string): boolean {
	const value = secret.trim().toLowerCase();
	return value === BETTER_AUTH_DEFAULT_SECRET || value.startsWith('change-me');
}

/**
 * What is wrong with a Better Auth secret, or null when it is usable. Checked in the order the
 * app's .env messages use: nothing at all, then a placeholder, then too short.
 */
export function secretProblem(secret: string): 'missing' | 'placeholder' | 'short' | null {
	if (secret === '') return 'missing';
	if (isPlaceholderSecret(secret)) return 'placeholder';
	if (secret.length < MIN_SECRET_LENGTH) return 'short';
	return null;
}
