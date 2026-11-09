import { describe, expect, it } from 'vitest';
import type { TrackedMessage } from '../../../src/lib/antispam/message-facts';
import { evaluateRules, RULES, TRACKING_WINDOW_MS } from '../../../src/lib/antispam/rules';

const NOW = 1_800_000_000_000;
let nextId = 0;

/** A plain message `ageMs` before NOW in channel `channel`. */
function message(channel: string, ageMs: number, overrides: Partial<TrackedMessage> = {}): TrackedMessage {
	return {
		id: String(nextId++),
		channelId: channel,
		createdAt: NOW - ageMs,
		repeatKey: `key-${nextId}`,
		mentionPoints: 0,
		hasCountedLink: false,
		excerpt: 'x',
		...overrides
	};
}

function evaluate(...messages: TrackedMessage[]) {
	return evaluateRules(messages, NOW);
}

describe('rule thresholds', () => {
	it('usesTheApprovedWindowsAndThresholds', () => {
		expect(RULES).toEqual({
			crossChannel: { windowMs: 60_000, threshold: 3 },
			flood: { windowMs: 10_000, threshold: 8 },
			repeat: { windowMs: 60_000, threshold: 4 },
			mentionBurst: { windowMs: 30_000, threshold: 6 },
			linkSpread: { windowMs: 60_000, threshold: 2 }
		});
		expect(TRACKING_WINDOW_MS).toBe(600_000);
	});
});

describe('evaluateRules - cross-channel (AC-01)', () => {
	it('firesWhenAMemberPostsInThreeChannelsWithinAMinute', () => {
		expect(evaluate(message('a', 50_000), message('b', 20_000), message('c', 0))).toEqual(['crossChannel']);
	});

	it('doesNotFireForTwoChannels', () => {
		expect(evaluate(message('a', 30_000), message('b', 20_000), message('a', 10_000), message('b', 0))).toEqual([]);
	});

	it('doesNotFireForThreeChannelsOverTwoMinutes', () => {
		expect(evaluate(message('a', 120_000), message('b', 60_000), message('c', 0))).toEqual([]);
	});

	it('leavesOutAMessageExactlyOneWindowOld', () => {
		expect(evaluate(message('a', 60_000), message('b', 30_000), message('c', 0))).toEqual([]);
		expect(evaluate(message('a', 59_999), message('b', 30_000), message('c', 0))).toEqual(['crossChannel']);
	});

	it('countsAThreadAsItsOwnChannel', () => {
		// A thread's messages carry the thread's own channel ID, separate from its parent's.
		expect(evaluate(message('parent', 20_000), message('thread-1', 10_000), message('thread-2', 0))).toEqual(['crossChannel']);
	});
});

describe('evaluateRules - flood (AC-02)', () => {
	it('firesOnTheEighthMessageWithinTenSeconds', () => {
		const seven = Array.from({ length: 7 }, (_, i) => message('a', 9_000 - i * 1_000));

		expect(evaluate(...seven)).toEqual([]);
		expect(evaluate(...seven, message('a', 0))).toEqual(['flood']);
	});

	it('doesNotFireForEightMessagesOverMoreThanTenSeconds', () => {
		const spread = Array.from({ length: 8 }, (_, i) => message('a', 14_000 - i * 2_000));

		expect(evaluate(...spread)).toEqual([]);
	});
});

describe('evaluateRules - repeat (AC-03)', () => {
	it('firesOnTheFourthCopyWithinAMinute', () => {
		const copies = (n: number) => Array.from({ length: n }, (_, i) => message('a', 50_000 - i * 15_000, { repeatKey: 'same' }));

		expect(evaluate(...copies(3))).toEqual([]);
		expect(evaluate(...copies(4))).toEqual(['repeat']);
	});

	it('neverCountsMessagesWithoutText', () => {
		const empty = Array.from({ length: 5 }, (_, i) => message('a', 50_000 - i * 12_000, { repeatKey: null }));

		expect(evaluate(...empty)).toEqual([]);
	});

	it('doesNotFireForFourDifferentTexts', () => {
		expect(evaluate(message('a', 40_000), message('a', 30_000), message('a', 20_000), message('a', 0))).toEqual([]);
	});
});

describe('evaluateRules - mention burst (AC-04)', () => {
	it('firesWhenMentionPointsReachSixWithinThirtySeconds', () => {
		expect(evaluate(message('a', 20_000, { mentionPoints: 3 }), message('a', 0, { mentionPoints: 2 }))).toEqual([]);
		expect(evaluate(message('a', 20_000, { mentionPoints: 3 }), message('a', 0, { mentionPoints: 3 }))).toEqual(['mentionBurst']);
	});

	it('leavesOutMentionsOlderThanThirtySeconds', () => {
		expect(evaluate(message('a', 30_000, { mentionPoints: 5 }), message('a', 0, { mentionPoints: 1 }))).toEqual([]);
	});
});

describe('evaluateRules - link spread (AC-05)', () => {
	it('firesWhenLinksArePostedInTwoChannelsWithinAMinute', () => {
		expect(evaluate(message('a', 30_000, { hasCountedLink: true }), message('b', 0, { hasCountedLink: true }))).toEqual(['linkSpread']);
	});

	it('doesNotFireForLinksInOneChannel', () => {
		expect(evaluate(message('a', 30_000, { hasCountedLink: true }), message('a', 0, { hasCountedLink: true }))).toEqual([]);
	});

	it('onlyCountsChannelsWhereTheMessageHadALink', () => {
		expect(evaluate(message('a', 30_000, { hasCountedLink: true }), message('b', 0))).toEqual([]);
	});
});

describe('evaluateRules - several rules', () => {
	it('reportsEveryRuleThatFiresInRuleOrder', () => {
		const spam = (channel: string, age: number) => message(channel, age, { repeatKey: 'same', hasCountedLink: true, mentionPoints: 3 });

		expect(evaluate(spam('a', 3_000), spam('b', 2_000), spam('c', 1_000), spam('d', 0))).toEqual([
			'crossChannel',
			'repeat',
			'mentionBurst',
			'linkSpread'
		]);
	});
});
