import { isNullishOrEmpty } from '@sapphire/utilities';

export function envParseArray(key: 'OWNERS', defaultValue?: string[]): string[] {
	const value = process.env[key];
	if (isNullishOrEmpty(value)) {
		if (defaultValue === undefined) throw new Error(`[ENV] ${key} - The key must be an array, but is empty or undefined.`);
		return defaultValue;
	}

	return value.split(' ');
}

const SNOWFLAKE = /^\d{17,20}$/;

export type OptionalSnowflakeKey = 'STATUS_CHANNEL_ID' | 'ANNOUNCEMENTS_CHANNEL_ID' | 'RULES_CHANNEL_ID';

export function envParseOptionalSnowflake(key: OptionalSnowflakeKey): string | null {
	const value = process.env[key]?.trim();
	if (isNullishOrEmpty(value)) return null;
	if (!SNOWFLAKE.test(value)) throw new Error(`[ENV] ${key} - The key must be a Discord ID (17-20 digits).`);

	return value;
}
