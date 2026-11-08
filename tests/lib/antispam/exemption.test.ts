import { describe, expect, it } from 'vitest';
import { isChecked, type CheckInput } from '../../../src/lib/antispam/exemption';
import { FAKE_BOT_ID, FAKE_MEMBER_ID } from '../../helpers/discord';

const OWNER_ID = '678901234567890123';
const OTHER_BOT_ID = '789012345678901234';

function input(overrides: Partial<CheckInput> = {}): CheckInput {
	return {
		inGuild: true,
		isSystem: false,
		authorId: FAKE_MEMBER_ID,
		botUserId: FAKE_BOT_ID,
		isWebhook: false,
		ownerIds: [OWNER_ID],
		hasManageMessages: false,
		...overrides
	};
}

describe('isChecked', () => {
	it('checksAnOrdinaryMember', () => {
		expect(isChecked(input())).toBe(true);
	});

	it('checksOtherBotsLikeAnyMember', () => {
		// The author's bot flag is deliberately not part of the decision (AC-10).
		expect(isChecked(input({ authorId: OTHER_BOT_ID }))).toBe(true);
	});

	it('neverChecksAModeratorWithManageMessages', () => {
		expect(isChecked(input({ hasManageMessages: true }))).toBe(false);
	});

	it('neverChecksAnOwner', () => {
		expect(isChecked(input({ authorId: OWNER_ID }))).toBe(false);
	});

	it('neverChecksTheBotItself', () => {
		expect(isChecked(input({ authorId: FAKE_BOT_ID }))).toBe(false);
	});

	it('neverChecksWebhookMessages', () => {
		expect(isChecked(input({ isWebhook: true }))).toBe(false);
	});

	it('ignoresDirectMessagesAndSystemMessages', () => {
		expect(isChecked(input({ inGuild: false }))).toBe(false);
		expect(isChecked(input({ isSystem: true }))).toBe(false);
	});

	it('doesNotTreatAPartialIdMatchAsAnOwner', () => {
		expect(isChecked(input({ authorId: FAKE_MEMBER_ID, ownerIds: [`${FAKE_MEMBER_ID} ${OWNER_ID}`] }))).toBe(true);
	});
});
