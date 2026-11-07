import { Colors } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { UNPLANNED_OUTAGE_LINE } from '../../../src/lib/status/copy';
import { buildStatusMessage } from '../../../src/lib/status/message';

const timestamp = new Date('2026-11-07T12:00:00.000Z');

function embedOf(input: Parameters<typeof buildStatusMessage>[0]) {
	return buildStatusMessage(input).embeds[0].toJSON();
}

describe('buildStatusMessage', () => {
	it('buildsAGreenOnlineEmbedWithTitlePhraseAndTimestamp', () => {
		expect(embedOf({ kind: 'online', phrase: 'Măi animalule, m-am întors!', unplannedOutage: false, timestamp })).toEqual({
			color: Colors.Green,
			title: '🟢 Ion Iliescu e online',
			description: 'Măi animalule, m-am întors!',
			timestamp: '2026-11-07T12:00:00.000Z'
		});
	});

	it('buildsARedOfflineEmbedWithTitlePhraseAndTimestamp', () => {
		expect(embedOf({ kind: 'offline', phrase: 'Ies din emisie. Urmează Cântarea României.', unplannedOutage: false, timestamp })).toEqual({
			color: Colors.Red,
			title: '🔴 Ion Iliescu e offline',
			description: 'Ies din emisie. Urmează Cântarea României.',
			timestamp: '2026-11-07T12:00:00.000Z'
		});
	});

	it('addsTheOutageLineBelowThePhraseAfterAnUnplannedOutage', () => {
		expect(embedOf({ kind: 'online', phrase: 'Iliescu apare, botul răsare!', unplannedOutage: true, timestamp }).description).toBe(
			`Iliescu apare, botul răsare!\n\n${UNPLANNED_OUTAGE_LINE}`
		);
	});

	it('leavesTheOutageLineOutAfterAPlannedStop', () => {
		expect(embedOf({ kind: 'online', phrase: 'Iliescu apare, botul răsare!', unplannedOutage: false, timestamp }).description).not.toContain(
			UNPLANNED_OUTAGE_LINE
		);
	});

	it('neverPutsTheOutageLineOnAnOfflineEmbed', () => {
		expect(
			embedOf({ kind: 'offline', phrase: 'Măi animalule, cine a oprit serverul?', unplannedOutage: true, timestamp }).description
		).not.toContain(UNPLANNED_OUTAGE_LINE);
	});

	it('mentionsNobodyWhateverThePhraseSays', () => {
		const payload = buildStatusMessage({ kind: 'online', phrase: '@everyone <@123456789012345678>', unplannedOutage: false, timestamp });

		expect(payload.allowedMentions).toEqual({ parse: [] });
	});
});
