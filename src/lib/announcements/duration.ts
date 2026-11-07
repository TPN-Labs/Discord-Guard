// Time on the server in Romanian: docs/specs/2026-11-07-join-leave-announcements/requirements.md §6.4, design.md §5.5.

export type DurationUnit = 'year' | 'month' | 'day' | 'hour' | 'minute';

const WORDS: Readonly<Record<DurationUnit, { one: string; many: string }>> = {
	year: { one: 'un an', many: 'ani' },
	month: { one: 'o lună', many: 'luni' },
	day: { one: 'o zi', many: 'zile' },
	hour: { one: 'o oră', many: 'ore' },
	minute: { one: 'un minut', many: 'minute' }
};

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** A count of one is a word; 20 and above take "de" unless the last two digits are 01-19. */
export function romanianCount(n: number, unit: DurationUnit): string {
	const { one, many } = WORDS[unit];
	if (n === 1) return one;

	const lastTwo = n % 100;
	const takesDe = n >= 20 && (lastTwo === 0 || lastTwo >= 20);
	return takesDe ? `${n} de ${many}` : `${n} ${many}`;
}

/** Calendar months in UTC; a day the target month lacks clamps to its last day (31 Jan + 1 month = 28 Feb). */
function addMonthsClamped(date: Date, months: number): Date {
	const target = new Date(
		Date.UTC(
			date.getUTCFullYear(),
			date.getUTCMonth() + months,
			1,
			date.getUTCHours(),
			date.getUTCMinutes(),
			date.getUTCSeconds(),
			date.getUTCMilliseconds()
		)
	);
	const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
	target.setUTCDate(Math.min(date.getUTCDate(), lastDay));
	return target;
}

/** How many whole steps of `stepMonths` fit between `from` and `to`. */
function wholeMonthsBetween(from: Date, to: Date, stepMonths: number): number {
	let steps = Math.floor(((to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth())) / stepMonths);
	while (steps > 0 && addMonthsClamped(from, steps * stepMonths) > to) steps--;
	return Math.max(steps, 0);
}

/** The largest non-zero unit, plus the next smaller unit when it is non-zero. */
export function formatDuration(from: Date, to: Date): string {
	if (to.getTime() - from.getTime() < MINUTE_MS) return 'mai puțin de un minut';

	// Whole years from the join date first, then whole months from that anchor (design §5.5): a leap-day join
	// clamps to 28 February once, and the months after it count from there.
	const years = wholeMonthsBetween(from, to, 12);
	const afterYears = addMonthsClamped(from, years * 12);
	const months = wholeMonthsBetween(afterYears, to, 1);

	const rest = to.getTime() - addMonthsClamped(afterYears, months).getTime();
	const parts: [DurationUnit, number][] = [
		['year', years],
		['month', months],
		['day', Math.floor(rest / DAY_MS)],
		['hour', Math.floor((rest % DAY_MS) / HOUR_MS)],
		['minute', Math.floor((rest % HOUR_MS) / MINUTE_MS)]
	];

	const first = parts.findIndex(([, n]) => n > 0);
	const [unit, n] = parts[first];
	const next = parts[first + 1];
	return next !== undefined && next[1] > 0 ? `${romanianCount(n, unit)} și ${romanianCount(next[1], next[0])}` : romanianCount(n, unit);
}
