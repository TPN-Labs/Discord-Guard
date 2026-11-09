/** Everything the "who is checked" decision needs, read from the message by SpamGuard. */
export interface CheckInput {
	/** False for a direct message to the bot (requirements AC-07). */
	inGuild: boolean;
	/** Join notices, pins, boosts and other system messages. */
	isSystem: boolean;
	authorId: string;
	botUserId: string;
	/** `message.webhookId !== null`: a webhook has no member and can't be kicked (AC-10). */
	isWebhook: boolean;
	ownerIds: readonly string[];
	/** The member has Manage Messages in the server, Administrator included (AC-08). */
	hasManageMessages: boolean;
}

/** Whether anti-spam checks and tracks this message (AC-07 to AC-11). Other bots are checked like anyone else. */
export function isChecked({ inGuild, isSystem, authorId, botUserId, isWebhook, ownerIds, hasManageMessages }: CheckInput): boolean {
	if (!inGuild || isSystem || isWebhook) return false;
	if (authorId === botUserId) return false;
	if (ownerIds.includes(authorId)) return false;
	return !hasManageMessages;
}
