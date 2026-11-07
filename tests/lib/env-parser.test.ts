import { describe, expect, it, vi } from 'vitest';
import { envParseArray, envParseOptionalSnowflake } from '../../src/lib/env-parser';

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

describe('envParseOptionalSnowflake', () => {
	it('returnsNullWhenTheVariableIsUnset', () => {
		vi.stubEnv('STATUS_CHANNEL_ID', undefined);

		expect(envParseOptionalSnowflake('STATUS_CHANNEL_ID')).toBeNull();
	});

	it('returnsNullWhenTheVariableIsBlank', () => {
		vi.stubEnv('STATUS_CHANNEL_ID', '   ');

		expect(envParseOptionalSnowflake('STATUS_CHANNEL_ID')).toBeNull();
	});

	it('returnsTheTrimmedIdWhenItIsADiscordId', () => {
		vi.stubEnv('STATUS_CHANNEL_ID', ' 123456789012345678 ');

		expect(envParseOptionalSnowflake('STATUS_CHANNEL_ID')).toBe('123456789012345678');
	});

	it.each(['abc', '1234567890123456', '123456789012345678901', '123456789012345678 234567890123456789', '<#123456789012345678>'])(
		'refusesToStartWhenTheValueIsNotADiscordId (%s)',
		(value) => {
			vi.stubEnv('STATUS_CHANNEL_ID', value);

			expect(() => envParseOptionalSnowflake('STATUS_CHANNEL_ID')).toThrow(
				'[ENV] STATUS_CHANNEL_ID - The key must be a Discord ID (17-20 digits).'
			);
		}
	);
});

// docs/specs/2026-11-07-join-leave-announcements: AC-06, AC-07, AC-15, AC-16
describe.each(['ANNOUNCEMENTS_CHANNEL_ID', 'RULES_CHANNEL_ID'] as const)('envParseOptionalSnowflake(%s)', (key) => {
	it('returnsNullWhenTheVariableIsUnset', () => {
		vi.stubEnv(key, undefined);

		expect(envParseOptionalSnowflake(key)).toBeNull();
	});

	it('returnsTheTrimmedIdWhenItIsADiscordId', () => {
		vi.stubEnv(key, ' 123456789012345678 ');

		expect(envParseOptionalSnowflake(key)).toBe('123456789012345678');
	});

	it('refusesToStartWithTheKeyNamedWhenTheValueIsNotADiscordId', () => {
		vi.stubEnv(key, 'abc');

		expect(() => envParseOptionalSnowflake(key)).toThrow(`[ENV] ${key} - The key must be a Discord ID (17-20 digits).`);
	});
});
