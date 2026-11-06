import { describe, expect, it, vi } from 'vitest';
import { envParseArray } from '../../src/lib/env-parser';

describe('envParseArray', () => {
	it('splitsSpaceSeparatedOwnerIdsIntoAList', () => {
		vi.stubEnv('OWNERS', '123456789012345678 234567890123456789');

		expect(envParseArray('OWNERS')).toEqual(['123456789012345678', '234567890123456789']);
	});

	it('returnsTheDefaultWhenTheVariableIsEmpty', () => {
		vi.stubEnv('OWNERS', '');

		expect(envParseArray('OWNERS', ['fallback'])).toEqual(['fallback']);
	});

	it('refusesToStartWhenTheVariableIsMissingAndNoDefaultIsGiven', () => {
		vi.stubEnv('OWNERS', undefined);

		expect(() => envParseArray('OWNERS')).toThrow('[ENV] OWNERS');
	});
});
