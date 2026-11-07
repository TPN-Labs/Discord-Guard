import { describe, expect, it } from 'vitest';
import { formatDuration, romanianCount, type DurationUnit } from '../../../src/lib/announcements/duration';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const JOINED = new Date('2026-01-01T00:00:00.000Z');

function after(ms: number, from = JOINED): Date {
	return new Date(from.getTime() + ms);
}

function utc(iso: string): Date {
	return new Date(`${iso}Z`);
}

// requirements.md §6.4 and AC-11.
describe('romanianCount', () => {
	it.each<[DurationUnit, string]>([
		['year', 'un an'],
		['month', 'o lună'],
		['day', 'o zi'],
		['hour', 'o oră'],
		['minute', 'un minut']
	])('writesACountOfOneAsAWord (%s)', (unit, expected) => {
		expect(romanianCount(1, unit)).toBe(expected);
	});

	it.each<[number, DurationUnit, string]>([
		[2, 'year', '2 ani'],
		[5, 'month', '5 luni'],
		[3, 'day', '3 zile'],
		[4, 'hour', '4 ore'],
		[19, 'minute', '19 minute'],
		[20, 'day', '20 de zile'],
		[25, 'minute', '25 de minute'],
		[100, 'day', '100 de zile'],
		[101, 'day', '101 zile'],
		[119, 'day', '119 zile'],
		[120, 'day', '120 de zile']
	])('addsDeFromTwentyUnlessTheLastTwoDigitsAreOneToNineteen (%i %s)', (n, unit, expected) => {
		expect(romanianCount(n, unit)).toBe(expected);
	});
});

describe('formatDuration', () => {
	it.each<[string, Date, string]>([
		['40 seconds', after(40_000), 'mai puțin de un minut'],
		['1 minute 30 seconds', after(MINUTE + 30_000), 'un minut'],
		['25 minutes', after(25 * MINUTE), '25 de minute'],
		['1 hour 5 minutes', after(HOUR + 5 * MINUTE), 'o oră și 5 minute'],
		['3 days 4 hours', after(3 * DAY + 4 * HOUR), '3 zile și 4 ore'],
		['2 months 0 days 6 hours', utc('2026-03-01T06:00:00'), '2 luni'],
		['1 year 2 months', utc('2027-03-01T00:00:00'), 'un an și 2 luni'],
		['21 years 1 month', utc('2047-02-01T00:00:00'), '21 de ani și o lună']
	])('rendersTheRequirementsExample (%s)', (_label, leftAt, expected) => {
		expect(formatDuration(JOINED, leftAt)).toBe(expected);
	});

	it('dropsAZeroSecondUnitInsteadOfReachingForAThird', () => {
		expect(formatDuration(JOINED, utc('2028-01-11T00:00:00'))).toBe('2 ani');
	});

	it('clampsToTheLastDayOfAShorterMonth', () => {
		expect(formatDuration(utc('2026-01-31T00:00:00'), utc('2026-02-28T00:00:00'))).toBe('o lună');
	});

	it('countsWholeYearsBeforeWholeMonthsFromALeapDay', () => {
		expect(formatDuration(utc('2024-02-29T00:00:00'), utc('2025-03-28T00:00:00'))).toBe('un an și o lună');
	});

	it('doesNotCountAMonthThatHasNotEnded', () => {
		expect(formatDuration(utc('2026-01-15T12:00:00'), utc('2026-02-15T11:00:00'))).toBe('30 de zile și 23 de ore');
	});

	it('treatsAJoinDateInTheFutureAsUnderAMinute', () => {
		expect(formatDuration(after(HOUR), JOINED)).toBe('mai puțin de un minut');
	});
});
