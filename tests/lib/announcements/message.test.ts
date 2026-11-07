import { Colors } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { buildJoinAnnouncement, buildLeaveAnnouncement } from '../../../src/lib/announcements/message';
import { FAKE_CHANNEL_ID, FAKE_MEMBER_ID } from '../../helpers/discord';

const AVATAR_URL = 'https://cdn.discordapp.com/embed/avatars/0.png';
const NOW = new Date('2026-11-07T12:00:00.000Z');
const JOIN_TEXT = `Ultima oră la Telejurnal: <@${FAKE_MEMBER_ID}> e membru nou. Urmează două ore despre recoltă.`;
const LEAVE_TEXT = '**Ion** (ion1930) a sărit gardul ambasadei. Drum bun în Occident!';

function join(rulesChannelId: string | null = null) {
	return buildJoinAnnouncement({ memberId: FAKE_MEMBER_ID, avatarUrl: AVATAR_URL, rulesChannelId, timestamp: NOW });
}

function leave(joinedAt: Date | null) {
	return buildLeaveAnnouncement({ name: '**Ion** (ion1930)', joinedAt, leftAt: NOW });
}

// requirements.md AC-02, AC-03, AC-05, AC-06, AC-19.
describe('buildJoinAnnouncement', () => {
	it('buildsAGreenEmbedWithTitlePhraseAvatarAndTimestamp', () => {
		expect(join().embeds[0].toJSON()).toEqual({
			color: Colors.Green,
			title: '👋 Avem un tovarăș nou',
			description: JOIN_TEXT,
			thumbnail: { url: AVATAR_URL },
			timestamp: '2026-11-07T12:00:00.000Z'
		});
	});

	it('endsWithTheRulesLineWhenARulesChannelIsConfigured', () => {
		expect(join(FAKE_CHANNEL_ID).embeds[0].toJSON().description).toBe(
			`${JOIN_TEXT}\n\n📜 Regulile sunt în <#${FAKE_CHANNEL_ID}>. Citește-le, tovarășe!`
		);
	});

	it('leavesTheRulesLineOutWhenNoRulesChannelIsConfigured', () => {
		expect(join(null).embeds[0].toJSON().description).not.toContain('📜');
	});

	it('pingsTheNewMemberAndNobodyElse', () => {
		const payload = join();

		expect(payload.content).toBe(`<@${FAKE_MEMBER_ID}>`);
		expect(payload.allowedMentions).toEqual({ parse: [], users: [FAKE_MEMBER_ID] });
	});
});

// requirements.md AC-09, AC-10, AC-11, AC-12, AC-19.
describe('buildLeaveAnnouncement', () => {
	it('buildsAGreyEmbedWithTitlePhraseAndTimestamp', () => {
		expect(leave(null).embeds[0].toJSON()).toEqual({
			color: Colors.Grey,
			title: '🚪 Un tovarăș ne-a părăsit',
			description: LEAVE_TEXT,
			timestamp: '2026-11-07T12:00:00.000Z'
		});
	});

	it('addsHowLongTheMemberStayedWhenTheJoinDateIsKnown', () => {
		const joinedAt = new Date('2026-11-04T08:00:00.000Z');

		expect(leave(joinedAt).embeds[0].toJSON().description).toBe(`${LEAVE_TEXT}\n\n⏳ A stat cu noi 3 zile și 4 ore.`);
	});

	it('leavesTheDurationLineOutWhenTheJoinDateIsUnknown', () => {
		expect(leave(null).embeds[0].toJSON().description).not.toContain('⏳');
	});

	it('showsANameWithReplacementPatternsLiterally', () => {
		const payload = buildLeaveAnnouncement({ name: "**$& $' $`**", joinedAt: null, leftAt: NOW });

		expect(payload.embeds[0].toJSON().description).toBe("**$& $' $`** a sărit gardul ambasadei. Drum bun în Occident!");
	});

	it('pingsNobody', () => {
		const payload = leave(null);

		expect(payload).not.toHaveProperty('content');
		expect(payload.allowedMentions).toEqual({ parse: [] });
	});
});
