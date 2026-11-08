import { describe, expect, it, vi } from 'vitest';
import { EnforcementQueue, MAX_RUNNING_ENFORCEMENTS, MAX_WAITING_ENFORCEMENTS } from '../../../src/lib/antispam/queue';
import { fakeLogger } from '../../helpers/discord';

/** A task that stays running until release() is called. */
function gate() {
	let release!: () => void;
	let fail!: (error: Error) => void;
	const done = new Promise<void>((resolve, reject) => {
		release = resolve;
		fail = reject;
	});
	const task = vi.fn(() => done);
	return { task, release, fail };
}

function setup() {
	const logger = fakeLogger();
	return { logger, queue: new EnforcementQueue({ logger }) };
}

describe('EnforcementQueue', () => {
	it('usesTheApprovedLimits', () => {
		expect(MAX_RUNNING_ENFORCEMENTS).toBe(5);
		expect(MAX_WAITING_ENFORCEMENTS).toBe(50);
	});

	it('startsATaskRightAwayWhenThereIsRoom', () => {
		const { queue } = setup();
		const { task } = gate();

		expect(queue.submit('a', task)).toBe('started');
		expect(task).toHaveBeenCalledTimes(1);
		expect(queue.has('a')).toBe(true);
	});

	it('acceptsOneEntryPerMemberWhileItIsRunningOrWaiting', () => {
		const { queue } = setup();
		const first = gate();
		const second = gate();

		queue.submit('a', first.task);

		expect(queue.submit('a', second.task)).toBe('duplicate');
		expect(second.task).not.toHaveBeenCalled();
	});

	it('acceptsTheSameMemberAgainOnceTheirTaskHasFinished', async () => {
		const { queue } = setup();
		const first = gate();
		queue.submit('a', first.task);

		first.release();
		await vi.waitFor(() => expect(queue.has('a')).toBe(false));

		expect(queue.submit('a', gate().task)).toBe('started');
	});

	it('runsAtMostFiveAndQueuesFiftyMore', () => {
		const { queue } = setup();
		const results = Array.from({ length: 55 }, (_, i) => queue.submit(`m${i}`, gate().task));

		expect(results.filter((r) => r === 'started')).toHaveLength(5);
		expect(results.filter((r) => r === 'queued')).toHaveLength(50);
	});

	it('startsAWaitingTaskWhenARunningOneFinishes', async () => {
		const { queue } = setup();
		const running = Array.from({ length: 5 }, () => gate());
		running.forEach((g, i) => queue.submit(`r${i}`, g.task));
		const waiting = gate();
		queue.submit('w', waiting.task);

		expect(waiting.task).not.toHaveBeenCalled();
		running[0].release();

		await vi.waitFor(() => expect(waiting.task).toHaveBeenCalledTimes(1));
	});

	it('skipsBeyondFiftyWaitingAndWarnsOncePerBurst', () => {
		const { logger, queue } = setup();
		Array.from({ length: 55 }, (_, i) => queue.submit(`m${i}`, gate().task));

		const extra = Array.from({ length: 10 }, () => gate().task);
		const results = extra.map((task, i) => queue.submit(`x${i}`, task));

		expect(results).toEqual(Array(10).fill('skipped'));
		extra.forEach((task) => expect(task).not.toHaveBeenCalled());
		expect(logger.warn).toHaveBeenCalledTimes(1);
	});

	it('logsHowManyWereSkippedOnceTheQueueEmpties', async () => {
		const { logger, queue } = setup();
		const gates = Array.from({ length: 55 }, () => gate());
		gates.forEach((g, i) => queue.submit(`m${i}`, g.task));
		queue.submit('x1', gate().task);
		queue.submit('x2', gate().task);

		gates.forEach((g) => g.release());

		await vi.waitFor(() => expect(logger.warn).toHaveBeenCalledTimes(2));
		expect(String(logger.warn.mock.calls[1][0])).toContain('2');
	});

	it('neverHasMoreThanFiveRunningWhile200MembersFireTogether', async () => {
		const { queue } = setup();
		let running = 0;
		let peak = 0;
		const task = async () => {
			running++;
			peak = Math.max(peak, running);
			await new Promise((resolve) => setTimeout(resolve, 1));
			running--;
		};

		const results = Array.from({ length: 200 }, (_, i) => queue.submit(`m${i}`, task));

		await vi.waitFor(() => expect(Array.from({ length: 200 }, (_, i) => queue.has(`m${i}`)).some(Boolean)).toBe(false));
		expect(peak).toBe(5);
		expect(results.filter((r) => r !== 'skipped')).toHaveLength(55);
	});

	it('logsAFailedTaskAtErrorAndCarriesOn', async () => {
		const { logger, queue } = setup();
		const failing = gate();
		queue.submit('a', failing.task);

		failing.fail(new Error('boom'));

		await vi.waitFor(() => expect(logger.error).toHaveBeenCalledTimes(1));
		expect(String(logger.error.mock.calls[0][0])).toContain('boom');
		expect(queue.has('a')).toBe(false);
	});
});
