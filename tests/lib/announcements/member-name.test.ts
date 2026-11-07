import { describe, expect, it } from 'vitest';
import { formatMemberName } from '../../../src/lib/announcements/member-name';

// requirements.md AC-18.
describe('formatMemberName', () => {
	it('showsTheDisplayNameInBoldWithTheUsernameInBrackets', () => {
		expect(formatMemberName({ displayName: 'Ion', username: 'ion1930' })).toBe('**Ion** (ion1930)');
	});

	it('showsTheNameOnceWhenDisplayNameAndUsernameMatch', () => {
		expect(formatMemberName({ displayName: 'ion1930', username: 'ion1930' })).toBe('**ion1930**');
	});

	it('escapesMarkdownSoTheNameShowsExactlyAsWritten', () => {
		expect(formatMemberName({ displayName: '**Tov** __x__', username: 'ion_iliescu' })).toBe('**\\*\\*Tov\\*\\* \\_\\_x\\_\\_** (ion\\_iliescu)');
	});
});
