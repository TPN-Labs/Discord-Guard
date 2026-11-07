import { describe, expect, it } from 'vitest';
import { STATUS_TITLES } from '../../../src/lib/status/copy';
import { classifyPreviousRun, type StatusHistoryEntry } from '../../../src/lib/status/previous-run';

const BOT_ID = '123456789012345678';
const MEMBER_ID = '234567890123456789';
const OTHER_BOT_ID = '345678901234567890';

const online = (authorId = BOT_ID): StatusHistoryEntry => ({ authorId, embedTitles: [STATUS_TITLES.online] });
const offline = (authorId = BOT_ID): StatusHistoryEntry => ({ authorId, embedTitles: [STATUS_TITLES.offline] });
const chatter = (authorId: string, embedTitles: (string | null)[] = []): StatusHistoryEntry => ({ authorId, embedTitles });

describe('classifyPreviousRun', () => {
	it('reportsOnlineWhenTheBotsLastStatusMessageWasOnline', () => {
		expect(classifyPreviousRun([online(), offline()], BOT_ID)).toBe('online');
	});

	it('reportsOfflineWhenTheBotsLastStatusMessageWasOffline', () => {
		expect(classifyPreviousRun([offline(), online()], BOT_ID)).toBe('offline');
	});

	it('reportsNoneWhenTheBotHasNeverPostedAStatusMessage', () => {
		expect(classifyPreviousRun([], BOT_ID)).toBe('none');
	});

	it('skipsMessagesFromMembersAndOtherBots', () => {
		const history = [chatter(MEMBER_ID), online(OTHER_BOT_ID), chatter(MEMBER_ID, [STATUS_TITLES.online]), offline()];

		expect(classifyPreviousRun(history, BOT_ID)).toBe('offline');
	});

	it('skipsTheBotsOtherMessages', () => {
		const history = [chatter(BOT_ID), chatter(BOT_ID, ['Some other embed', null]), online()];

		expect(classifyPreviousRun(history, BOT_ID)).toBe('online');
	});

	it('reportsNoneWhenOnlyOtherAuthorsPostedStatusLookalikes', () => {
		expect(classifyPreviousRun([online(MEMBER_ID), offline(OTHER_BOT_ID)], BOT_ID)).toBe('none');
	});
});
