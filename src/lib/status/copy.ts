// Approved copy for the bot status messages: docs/specs/2026-11-07-status-messages/requirements.md §6.
// Romanian with comma-below diacritics (ș, ț). Changing a phrase is a reviewed PR, not a config change.

export type StatusKind = 'online' | 'offline';

export const ONLINE_PHRASES: readonly [string, ...string[]] = [
	'Măi animalule, m-am întors!',
	'Iliescu apare, botul răsare!',
	'Online. Aici construim o democrație originală.',
	'Am pornit ca o Dacie 1300 iarna: din a treia cheie, dar am pornit.',
	'Fraților, am învins! Botul e liber!'
];

export const OFFLINE_PHRASES: readonly [string, ...string[]] = [
	'S-a luat curentul. Ca pe vremuri. Revin când dă drumul RENEL-ul.',
	'Măi animalule, cine a oprit serverul?',
	'Offline. Mi-am pus economiile în Caritas și acum n-am bani nici de server.',
	'Ies din emisie. Urmează Cântarea României.',
	'Plec la coadă la portocale. E Crăciun, poate se dă.'
];

export const STATUS_TITLES: Readonly<Record<StatusKind, string>> = {
	online: '🟢 Ion Iliescu e online',
	offline: '🔴 Ion Iliescu e offline'
};

export const UNPLANNED_OUTAGE_LINE = '⚡ Revin după o pană de curent neprogramată.';
