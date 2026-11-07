const ZERO_WIDTH_SPACE = String.fromCharCode(8203);

/**
 * Makes `/eval` output safe to post in Discord: breaks code fences and mentions with a zero-width
 * space, and hides the bot token behind `<TOKEN>`.
 * @param text The stringified eval result
 * @param token The bot token to hide
 */
export function scrubEvalOutput(text: string, token: string): string {
	const escaped = text.replace(/`/g, '`' + ZERO_WIDTH_SPACE).replace(/@/g, '@' + ZERO_WIDTH_SPACE);
	// An empty pattern matches every gap between characters, so there is nothing to hide without a token.
	return token ? escaped.replaceAll(token, '<TOKEN>') : escaped;
}
