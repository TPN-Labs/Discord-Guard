import { describe, expect, it } from 'vitest';
import { scrubEvalOutput } from '../../src/lib/eval-scrub';

const FAKE_TOKEN = 'fake-bot-token-for-tests';
const ZERO_WIDTH_SPACE = String.fromCharCode(8203);

describe('scrubEvalOutput', () => {
	it('hidesTheTokenWhenItAppearsOnce', () => {
		expect(scrubEvalOutput(`token: ${FAKE_TOKEN}`, FAKE_TOKEN)).toBe('token: <TOKEN>');
	});

	it('hidesEveryCopyOfTheTokenWhenItAppearsTwice', () => {
		const output = scrubEvalOutput(`{ token: '${FAKE_TOKEN}', rest: { token: '${FAKE_TOKEN}' } }`, FAKE_TOKEN);

		expect(output).not.toContain(FAKE_TOKEN);
		expect(output).toBe(`{ token: '<TOKEN>', rest: { token: '<TOKEN>' } }`);
	});

	it('leavesTheTextUnchangedWhenTheTokenIsEmpty', () => {
		expect(scrubEvalOutput('no token here', '')).toBe('no token here');
	});

	it('breaksCodeFencesAndMentionsWithAZeroWidthSpace', () => {
		expect(scrubEvalOutput('`@everyone`', FAKE_TOKEN)).toBe(`\`${ZERO_WIDTH_SPACE}@${ZERO_WIDTH_SPACE}everyone\`${ZERO_WIDTH_SPACE}`);
	});
});
