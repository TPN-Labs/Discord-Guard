import type { ILogger } from '@sapphire/framework';

/** Enforcements running at once (docs/specs/2026-11-08-anti-spam/requirements.md AC-27). */
export const MAX_RUNNING_ENFORCEMENTS = 5;
/** Enforcements waiting to start; beyond this, a member whose rule fires is not enforced against (AC-27). */
export const MAX_WAITING_ENFORCEMENTS = 50;

export type SubmitResult = 'started' | 'queued' | 'duplicate' | 'skipped';

type Task = () => Promise<void>;

/**
 * One enforcement per member at a time, at most 5 running and 50 waiting, so a raid can't build an unbounded queue of
 * Discord calls (Constitution §4.V; design §5.2-§5.3). Skips are counted and logged twice per burst, never per member.
 */
export class EnforcementQueue {
	private readonly logger: Pick<ILogger, 'warn' | 'error'>;
	/** Members running or waiting. */
	private readonly keys = new Set<string>();
	private readonly waiting: { key: string; task: Task }[] = [];
	private running = 0;
	private skipped = 0;

	public constructor({ logger }: { logger: Pick<ILogger, 'warn' | 'error'> }) {
		this.logger = logger;
	}

	public submit(key: string, task: Task): SubmitResult {
		if (this.keys.has(key)) return 'duplicate';

		if (this.running < MAX_RUNNING_ENFORCEMENTS) {
			this.keys.add(key);
			this.start(key, task);
			return 'started';
		}

		if (this.waiting.length < MAX_WAITING_ENFORCEMENTS) {
			this.keys.add(key);
			this.waiting.push({ key, task });
			return 'queued';
		}

		if (this.skipped++ === 0) {
			this.logger.warn(
				`[AntiSpam] ${MAX_RUNNING_ENFORCEMENTS} enforcements are running and ${MAX_WAITING_ENFORCEMENTS} are waiting; members whose rules fire are not enforced against until the queue empties (first skipped: ${key}).`
			);
		}
		return 'skipped';
	}

	/** Whether the member is running or waiting. */
	public has(key: string): boolean {
		return this.keys.has(key);
	}

	private start(key: string, task: Task): void {
		// Counted synchronously, before the task's first await, so a burst can't all pass the check at once.
		this.running++;
		void this.run(key, task);
	}

	private async run(key: string, task: Task): Promise<void> {
		try {
			await task();
		} catch (error) {
			this.logger.error(`[AntiSpam] Enforcement against ${key} failed unexpectedly: ${error instanceof Error ? error.message : String(error)}`);
		} finally {
			this.running--;
			this.keys.delete(key);
			const next = this.waiting.shift();
			if (next !== undefined) this.start(next.key, next.task);
			else if (this.running === 0 && this.skipped > 0) {
				this.logger.warn(`[AntiSpam] Enforcement queue empty; skipped ${this.skipped} members whose rules fired.`);
				this.skipped = 0;
			}
		}
	}
}
