import { describe, expect, it } from 'vitest';
import type { TrackedMessage } from '../../../src/lib/antispam/message-facts';
import { MAX_MESSAGES_PER_MEMBER, MAX_TRACKED_MEMBERS, MessageTracker } from '../../../src/lib/antispam/tracker';

const START = 1_800_000_000_000;
const TEN_MINUTES = 600_000;

function message(id: number, createdAt: number): TrackedMessage {
	return { id: String(id), channelId: 'c', createdAt, repeatKey: null, mentionPoints: 0, hasCountedLink: false, excerpt: '' };
}

function setup() {
	const clock = { now: START };
	const tracker = new MessageTracker({ now: () => clock.now });
	return { clock, tracker };
}

describe('MessageTracker', () => {
	it('usesTheApprovedCaps', () => {
		expect(MAX_MESSAGES_PER_MEMBER).toBe(50);
		expect(MAX_TRACKED_MEMBERS).toBe(5_000);
	});

	it('returnsTheMembersHistoryOldestFirstWithTheNewMessageLast', () => {
		const { tracker } = setup();
		tracker.record('g:a', message(1, START));
		tracker.record('g:b', message(2, START));

		expect(tracker.record('g:a', message(3, START)).map((m) => m.id)).toEqual(['1', '3']);
	});

	it('forgetsTheOldestMessageWhenAMemberGoesOverFifty', () => {
		const { tracker } = setup();
		let history: readonly TrackedMessage[] = [];
		for (let i = 1; i <= 51; i++) history = tracker.record('g:a', message(i, START));

		expect(history).toHaveLength(50);
		expect(history[0].id).toBe('2');
		expect(history[49].id).toBe('51');
	});

	it('forgetsMessagesTenMinutesAfterTheyWerePosted', () => {
		const { clock, tracker } = setup();
		tracker.record('g:a', message(1, START));
		clock.now = START + TEN_MINUTES;

		expect(tracker.record('g:a', message(2, clock.now)).map((m) => m.id)).toEqual(['2']);
	});

	it('takeRemovesAndReturnsOnlyUnexpiredMessages', () => {
		const { clock, tracker } = setup();
		tracker.record('g:a', message(1, START));
		tracker.record('g:a', message(2, START + 1_000));
		clock.now = START + TEN_MINUTES + 500;

		expect(tracker.take('g:a').map((m) => m.id)).toEqual(['2']);
		expect(tracker.take('g:a')).toEqual([]);
		expect(tracker.size).toBe(0);
	});

	it('evictsTheLeastRecentlyActiveMemberWhenAMemberOverTheCapArrives', () => {
		const { tracker } = setup();
		for (let i = 0; i < MAX_TRACKED_MEMBERS; i++) tracker.record(`g:${i}`, message(i, START));
		tracker.record('g:0', message(-1, START)); // member 0 is active again, so member 1 is now the least recent

		tracker.record('g:new', message(-2, START));

		expect(tracker.size).toBe(MAX_TRACKED_MEMBERS);
		expect(tracker.take('g:1')).toEqual([]);
		expect(tracker.take('g:0')).toHaveLength(2);
		expect(tracker.take('g:new')).toHaveLength(1);
	});

	it('reportsWhetherItStillHoldsMessagesForAMember', () => {
		const { tracker } = setup();
		tracker.record('g:a', message(1, START));

		expect(tracker.has('g:a')).toBe(true);
		expect(tracker.has('g:b')).toBe(false);
		tracker.take('g:a');
		expect(tracker.has('g:a')).toBe(false);
	});

	it('sweepDropsExpiredMessagesAndEmptyMembers', () => {
		const { clock, tracker } = setup();
		tracker.record('g:old', message(1, START));
		tracker.record('g:mixed', message(2, START));
		clock.now = START + 5 * 60_000;
		tracker.record('g:mixed', message(3, clock.now));
		clock.now = START + TEN_MINUTES;

		tracker.sweep();

		expect(tracker.size).toBe(1);
		expect(tracker.messageCount).toBe(1);
		expect(tracker.take('g:mixed').map((m) => m.id)).toEqual(['3']);
	});

	it('staysBoundedUnderAFloodOf100000MessagesFrom10000Members', () => {
		const { clock, tracker } = setup();
		for (let i = 0; i < 100_000; i++) {
			clock.now = START + i; // all inside ten minutes, so expiry never helps
			tracker.record(`g:${i % 10_000}`, message(i, clock.now));
		}

		expect(tracker.size).toBeLessThanOrEqual(MAX_TRACKED_MEMBERS);
		expect(tracker.messageCount).toBeLessThanOrEqual(MAX_TRACKED_MEMBERS * MAX_MESSAGES_PER_MEMBER);
	});
});
