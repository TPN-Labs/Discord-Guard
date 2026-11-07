import { describe, expect, it } from 'vitest';
import { shouldAnnounce } from '../../../src/lib/announcements/should-announce';

const GUILD_ID = '456789012345678901';
const OTHER_GUILD_ID = '567890123456789012';

// requirements.md AC-13, AC-14.
describe('shouldAnnounce', () => {
	it('announcesAPersonInTheAnnouncementsChannelsServer', () => {
		expect(shouldAnnounce({ isBot: false, memberGuildId: GUILD_ID, channelGuildId: GUILD_ID })).toBe(true);
	});

	it('skipsBotAccounts', () => {
		expect(shouldAnnounce({ isBot: true, memberGuildId: GUILD_ID, channelGuildId: GUILD_ID })).toBe(false);
	});

	it('ignoresJoinsAndLeavesInAnotherServer', () => {
		expect(shouldAnnounce({ isBot: false, memberGuildId: OTHER_GUILD_ID, channelGuildId: GUILD_ID })).toBe(false);
	});
});
