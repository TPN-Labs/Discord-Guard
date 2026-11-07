import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerShutdownHooks, SHUTDOWN_DEADLINE_MS, withDeadline } from '../../../src/lib/status/shutdown';

describe('withDeadline', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('reportsDoneWhenTheTaskFinishesInTime', async () => {
		await expect(withDeadline(async () => undefined, SHUTDOWN_DEADLINE_MS)).resolves.toEqual({ outcome: 'done' });
	});

	it('reportsTheErrorWhenTheTaskFails', async () => {
		const error = new Error('Missing Permissions');

		await expect(withDeadline(() => Promise.reject(error), SHUTDOWN_DEADLINE_MS)).resolves.toEqual({ outcome: 'failed', error });
	});

	it('reportsTheErrorWhenTheTaskThrowsSynchronously', async () => {
		const error = new Error('boom');
		const task = () => {
			throw error;
		};

		await expect(withDeadline(task, SHUTDOWN_DEADLINE_MS)).resolves.toEqual({ outcome: 'failed', error });
	});

	it('givesUpAtTheDeadlineWhenTheTaskHangs', async () => {
		const result = withDeadline(() => new Promise<void>(() => undefined), SHUTDOWN_DEADLINE_MS);

		await vi.advanceTimersByTimeAsync(SHUTDOWN_DEADLINE_MS - 1);
		let settled = false;
		void result.then(() => (settled = true));
		await Promise.resolve();
		expect(settled).toBe(false);

		await vi.advanceTimersByTimeAsync(1);
		await expect(result).resolves.toEqual({ outcome: 'timed-out' });
	});

	it('usesAFiveSecondDeadline', () => {
		expect(SHUTDOWN_DEADLINE_MS).toBe(5_000);
	});
});

describe('registerShutdownHooks', () => {
	function setup() {
		const proc = new EventEmitter();
		const onTrigger = vi.fn();
		registerShutdownHooks(proc as unknown as Pick<NodeJS.Process, 'on'>, onTrigger);
		return { proc, onTrigger };
	}

	it.each(['SIGTERM', 'SIGINT'] as const)('reportsAPlannedStopOn %s', (signal) => {
		const { proc, onTrigger } = setup();

		proc.emit(signal, signal);

		expect(onTrigger).toHaveBeenCalledWith(signal);
	});

	it('reportsAnUncaughtExceptionWithItsError', () => {
		const { proc, onTrigger } = setup();
		const error = new Error('boom');

		proc.emit('uncaughtException', error, 'uncaughtException');

		expect(onTrigger).toHaveBeenCalledWith('uncaughtException', error);
	});

	it('reportsAnUnhandledRejectionWithItsReason', () => {
		const { proc, onTrigger } = setup();
		const reason = new Error('rejected');

		proc.emit('unhandledRejection', reason, Promise.resolve());

		expect(onTrigger).toHaveBeenCalledWith('unhandledRejection', reason);
	});

	it('listensToNothingElse', () => {
		const { proc } = setup();

		expect(proc.eventNames().sort()).toEqual(['SIGINT', 'SIGTERM', 'uncaughtException', 'unhandledRejection']);
	});
});
