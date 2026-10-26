import { describe, expect, it } from 'vitest';
import { clientAddress } from './client-address';

describe('clientAddress', () => {
	it('returns the address SvelteKit resolved', () => {
		expect(clientAddress({ getClientAddress: () => '203.0.113.7' })).toBe('203.0.113.7');
	});

	it("returns '' when the server cannot tell (a missing ADDRESS_HEADER throws)", () => {
		const getClientAddress = () => {
			throw new Error('Address header was specified but is absent from request');
		};
		expect(clientAddress({ getClientAddress })).toBe('');
	});
});
