import type { TrackedMessage } from './message-facts';
import { TRACKING_WINDOW_MS } from './rules';

/** Per-member cap; the oldest message is forgotten first (docs/specs/2026-11-08-anti-spam/requirements.md AC-25). */
export const MAX_MESSAGES_PER_MEMBER = 50;
/** Member cap; the least recently active member is forgotten first (AC-26). */
export const MAX_TRACKED_MEMBERS = 5_000;

/**
 * Each checked member's recent messages, keyed by `${guildId}:${userId}`. Bounded by both caps and by the 10-minute
 * expiry, so a spam wave can't become a memory leak (Constitution §4.V; design §7).
 */
export class MessageTracker {
	/** Least recently active first: record() re-inserts its key, so Map order is activity order. */
	private readonly members = new Map<string, TrackedMessage[]>();
	private readonly now: () => number;

	public constructor({ now = () => Date.now() }: { now?: () => number } = {}) {
		this.now = now;
	}

	/** Remembers the message and returns the member's live history, oldest first, the new message last. */
	public record(key: string, message: TrackedMessage): readonly TrackedMessage[] {
		const history = this.unexpired(this.members.get(key) ?? []);
		history.push(message);
		if (history.length > MAX_MESSAGES_PER_MEMBER) history.splice(0, history.length - MAX_MESSAGES_PER_MEMBER);

		this.members.delete(key);
		this.members.set(key, history);
		if (this.members.size > MAX_TRACKED_MEMBERS) {
			const leastRecent = this.members.keys().next().value;
			if (leastRecent !== undefined) this.members.delete(leastRecent);
		}

		return history;
	}

	/** Forgets the member and returns their unexpired messages, oldest first. */
	public take(key: string): TrackedMessage[] {
		const history = this.members.get(key) ?? [];
		this.members.delete(key);
		return this.unexpired(history);
	}

	/** Drops expired messages everywhere, and members left with none. */
	public sweep(): void {
		for (const [key, history] of this.members) {
			const live = this.unexpired(history);
			if (live.length === 0) this.members.delete(key);
			else if (live.length !== history.length) this.members.set(key, live);
		}
	}

	/** Whether the member has tracked messages (possibly expired, until the next sweep or take). */
	public has(key: string): boolean {
		return this.members.has(key);
	}

	/** Members tracked now. */
	public get size(): number {
		return this.members.size;
	}

	/** Messages tracked now, across all members. */
	public get messageCount(): number {
		let count = 0;
		for (const history of this.members.values()) count += history.length;
		return count;
	}

	private unexpired(history: TrackedMessage[]): TrackedMessage[] {
		const cutoff = this.now() - TRACKING_WINDOW_MS;
		return history.filter((message) => message.createdAt > cutoff);
	}
}
