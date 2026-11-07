/**
 * Picks one phrase at random. The clamp keeps a random source that returns exactly 1 inside the list.
 */
export function pickPhrase(phrases: readonly [string, ...string[]], random: () => number = Math.random): string {
	const index = Math.min(Math.floor(random() * phrases.length), phrases.length - 1);
	return phrases[index];
}
