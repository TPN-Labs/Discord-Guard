import { describe, expect, it } from 'vitest';
import { countMentions, excerpt, normalizeForRepeat, toTrackedMessage } from '../../../src/lib/antispam/message-facts';
import { FAKE_CHANNEL_ID } from '../../helpers/discord';

const USER_A = '111111111111111111';
const USER_B = '222222222222222222';
const ROLE_A = '333333333333333333';

describe('normalizeForRepeat', () => {
	it('ignoresSurroundingWhitespaceAndLetterCase', () => {
		expect(normalizeForRepeat('  Free NITRO here \n')).toBe(normalizeForRepeat('free nitro here'));
	});

	it('keepsDifferentTextDifferent', () => {
		expect(normalizeForRepeat('free nitro')).not.toBe(normalizeForRepeat('free nitros'));
	});

	it('returnsNullForAMessageWithoutText', () => {
		expect(normalizeForRepeat('')).toBeNull();
		expect(normalizeForRepeat('   \n ')).toBeNull();
	});
});

describe('countMentions', () => {
	it('countsEachDistinctMemberAndRoleOnce', () => {
		expect(countMentions(`<@${USER_A}> <@!${USER_A}> <@${USER_B}> <@&${ROLE_A}> <@&${ROLE_A}>`)).toBe(3);
	});

	it('countsAnEveryoneOrHereAttemptAsThree', () => {
		expect(countMentions('@everyone free nitro')).toBe(3);
		expect(countMentions('@here look')).toBe(3);
		expect(countMentions(`@everyone @here <@${USER_A}>`)).toBe(4);
	});

	it('countsNothingInPlainText', () => {
		expect(countMentions('salut tovarăși, everyone and here')).toBe(0);
	});
});

describe('excerpt', () => {
	it('censorsLinksBeforeCutting', () => {
		expect(excerpt('Free nitro: https://free-nitro.ru/claim?x=1')).toBe('Free nitro: free-nitro');
	});

	it('cutsTo200CharactersWithAnEllipsis', () => {
		const long = 'a'.repeat(250);

		expect(excerpt(long)).toBe(`${'a'.repeat(200)}…`);
		expect(excerpt('a'.repeat(200))).toBe('a'.repeat(200));
	});

	it('neverSplitsAnEmoji', () => {
		const result = excerpt('😀'.repeat(250));

		expect(result).toBe(`${'😀'.repeat(200)}…`);
	});
});

describe('toTrackedMessage', () => {
	it('keepsOnlyTheFactsTheRulesAndKickLogNeed', () => {
		const tracked = toTrackedMessage({
			id: '444444444444444444',
			channelId: FAKE_CHANNEL_ID,
			createdAt: 1_000,
			content: `@everyone <@${USER_A}> https://free-nitro.ru/claim`
		});

		expect(tracked).toEqual({
			id: '444444444444444444',
			channelId: FAKE_CHANNEL_ID,
			createdAt: 1_000,
			repeatKey: expect.stringMatching(/^[0-9a-f]{40}$/),
			mentionPoints: 4,
			hasCountedLink: true,
			excerpt: `@everyone <@${USER_A}> free-nitro`
		});
	});

	it('givesTheSameRepeatKeyToTheSameTextAndNoneToAnEmptyMessage', () => {
		const message = (content: string) => toTrackedMessage({ id: '1', channelId: FAKE_CHANNEL_ID, createdAt: 0, content });

		expect(message('Hello').repeatKey).toBe(message(' hello ').repeatKey);
		expect(message('').repeatKey).toBeNull();
	});

	it('doesNotCountAGifLinkTowardsLinkSpread', () => {
		const tracked = toTrackedMessage({ id: '1', channelId: FAKE_CHANNEL_ID, createdAt: 0, content: 'https://tenor.com/view/cat-123' });

		expect(tracked.hasCountedLink).toBe(false);
	});
});
