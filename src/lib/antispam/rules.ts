import type { TrackedMessage } from './message-facts';

/** The five anti-spam rules (docs/specs/2026-11-08-anti-spam/requirements.md AC-01 to AC-05), in report order. */
export const RULE_IDS = ['crossChannel', 'flood', 'repeat', 'mentionBurst', 'linkSpread'] as const;

export type RuleId = (typeof RULE_IDS)[number];

/** Code constants by design (requirements §2): changing one is a reviewed PR. */
export const RULES: Record<RuleId, { windowMs: number; threshold: number }> = {
	crossChannel: { windowMs: 60_000, threshold: 3 }, // distinct channels (AC-01)
	flood: { windowMs: 10_000, threshold: 8 }, // messages (AC-02)
	repeat: { windowMs: 60_000, threshold: 4 }, // copies of the same text (AC-03)
	mentionBurst: { windowMs: 30_000, threshold: 6 }, // mention points (AC-04)
	linkSpread: { windowMs: 60_000, threshold: 2 } // distinct channels with a counted link (AC-05)
};

/** How long a message is remembered, and so how far back enforcement deletes (AC-14, AC-25). */
export const TRACKING_WINDOW_MS = 600_000;

const MEASURES: Record<RuleId, (messages: readonly TrackedMessage[]) => number> = {
	crossChannel: (messages) => new Set(messages.map((message) => message.channelId)).size,
	flood: (messages) => messages.length,
	repeat: (messages) => {
		const copies = new Map<string, number>();
		for (const { repeatKey } of messages) {
			if (repeatKey !== null) copies.set(repeatKey, (copies.get(repeatKey) ?? 0) + 1);
		}
		return Math.max(0, ...copies.values());
	},
	mentionBurst: (messages) => messages.reduce((sum, message) => sum + message.mentionPoints, 0),
	linkSpread: (messages) => new Set(messages.filter((message) => message.hasCountedLink).map((message) => message.channelId)).size
};

/**
 * The rules one member's messages break. `messages` is that member's history, new message included; `now` is the new
 * message's Discord timestamp, so a slow event loop can't stretch a window (design §5.4). A message exactly one window
 * old is outside it.
 */
export function evaluateRules(messages: readonly TrackedMessage[], now: number): RuleId[] {
	return RULE_IDS.filter((rule) => {
		const { windowMs, threshold } = RULES[rule];
		const inWindow = messages.filter((message) => message.createdAt > now - windowMs);
		return MEASURES[rule](inWindow) >= threshold;
	});
}
