import type { ShutdownTrigger } from './lifecycle';

/** Longest the status feature may hold up a shutdown: the offline message and the gateway close share it. */
export const SHUTDOWN_DEADLINE_MS = 5_000;

export type DeadlineResult = { outcome: 'done' } | { outcome: 'failed'; error: unknown } | { outcome: 'timed-out' };

/** Runs a task but stops waiting for it after `ms`. Never rejects. */
export function withDeadline(task: () => Promise<void>, ms: number): Promise<DeadlineResult> {
	return new Promise<DeadlineResult>((resolve) => {
		const timer = setTimeout(() => resolve({ outcome: 'timed-out' }), ms);
		const settle = (result: DeadlineResult) => {
			clearTimeout(timer);
			resolve(result);
		};

		try {
			task().then(
				() => settle({ outcome: 'done' }),
				(error: unknown) => settle({ outcome: 'failed', error })
			);
		} catch (error) {
			settle({ outcome: 'failed', error });
		}
	});
}

/**
 * Routes every way the process can be asked to stop into one handler.
 * Listening to uncaughtException and unhandledRejection replaces Node's default crash,
 * so the handler is responsible for exiting.
 */
export function registerShutdownHooks(proc: Pick<NodeJS.Process, 'on'>, onTrigger: (trigger: ShutdownTrigger, error?: unknown) => void): void {
	proc.on('SIGTERM', () => onTrigger('SIGTERM'));
	proc.on('SIGINT', () => onTrigger('SIGINT'));
	proc.on('uncaughtException', (error) => onTrigger('uncaughtException', error));
	proc.on('unhandledRejection', (reason) => onTrigger('unhandledRejection', reason));
}
