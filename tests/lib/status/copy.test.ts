import { describe, expect, it } from 'vitest';
import { OFFLINE_PHRASES, ONLINE_PHRASES, STATUS_TITLES, UNPLANNED_OUTAGE_LINE } from '../../../src/lib/status/copy';

// The approved copy from docs/specs/2026-11-07-status-messages/requirements.md §6, word for word.
describe('status message copy', () => {
	it('usesTheFiveApprovedOnlinePhrases', () => {
		expect(ONLINE_PHRASES).toEqual([
			'Măi animalule, m-am întors!',
			'Iliescu apare, botul răsare!',
			'Online. Aici construim o democrație originală.',
			'Am pornit ca o Dacie 1300 iarna: din a treia cheie, dar am pornit.',
			'Fraților, am învins! Botul e liber!'
		]);
	});

	it('usesTheFiveApprovedOfflinePhrases', () => {
		expect(OFFLINE_PHRASES).toEqual([
			'S-a luat curentul. Ca pe vremuri. Revin când dă drumul RENEL-ul.',
			'Măi animalule, cine a oprit serverul?',
			'Offline. Mi-am pus economiile în Caritas și acum n-am bani nici de server.',
			'Ies din emisie. Urmează Cântarea României.',
			'Plec la coadă la portocale. E Crăciun, poate se dă.'
		]);
	});

	it('usesTheApprovedTitlesAndOutageLine', () => {
		expect(STATUS_TITLES).toEqual({ online: '🟢 Ion Iliescu e online', offline: '🔴 Ion Iliescu e offline' });
		expect(UNPLANNED_OUTAGE_LINE).toBe('⚡ Revin după o pană de curent neprogramată.');
	});

	const allCopy = [...ONLINE_PHRASES, ...OFFLINE_PHRASES, STATUS_TITLES.online, STATUS_TITLES.offline, UNPLANNED_OUTAGE_LINE];

	it('usesCommaBelowDiacriticsNotCedillas', () => {
		for (const text of allCopy) expect(text).not.toMatch(/[şţŞŢ]/);
	});

	it('containsNoMassMentions', () => {
		for (const text of allCopy) expect(text).not.toMatch(/@(everyone|here)|<@/);
	});
});
