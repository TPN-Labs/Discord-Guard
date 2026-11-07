import { describe, expect, it } from 'vitest';
import { OFFLINE_PHRASES, ONLINE_PHRASES } from '../../../src/lib/status/copy';
import { pickPhrase } from '../../../src/lib/status/pick-phrase';

const phrases = ['first', 'second', 'third'] as const;

describe('pickPhrase', () => {
	it('picksTheFirstPhraseWhenRandomReturnsZero', () => {
		expect(pickPhrase(phrases, () => 0)).toBe('first');
	});

	it('picksThePhraseMatchingTheRandomSlot', () => {
		expect(pickPhrase(phrases, () => 0.5)).toBe('second');
	});

	it('picksTheLastPhraseWhenRandomIsJustBelowOne', () => {
		expect(pickPhrase(phrases, () => 0.999999)).toBe('third');
	});

	it('staysInsideTheListWhenARandomSourceReturnsOne', () => {
		expect(pickPhrase(phrases, () => 1)).toBe('third');
	});

	// M-07: every approved phrase is reachable with the real random source.
	it.each([
		['online', ONLINE_PHRASES],
		['offline', OFFLINE_PHRASES]
	] as const)('reachesEveryApprovedPhraseIn1000Picks (%s)', (_kind, list) => {
		const seen = new Set<string>();
		for (let i = 0; i < 1000; i++) seen.add(pickPhrase(list));

		expect([...seen].sort()).toEqual([...list].sort());
	});
});
