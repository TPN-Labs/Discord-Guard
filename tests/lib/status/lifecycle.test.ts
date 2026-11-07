import { describe, expect, it } from 'vitest';
import { StatusLifecycle } from '../../../src/lib/status/lifecycle';

function onlineLifecycle() {
	const lifecycle = new StatusLifecycle();
	lifecycle.tryBeginAnnounce();
	lifecycle.markOnlinePosted();
	return lifecycle;
}

describe('StatusLifecycle', () => {
	describe('announcing', () => {
		it('allowsTheOnlineAnnouncementOncePerProcess', () => {
			const lifecycle = new StatusLifecycle();

			expect(lifecycle.tryBeginAnnounce()).toBe(true);
			expect(lifecycle.tryBeginAnnounce()).toBe(false);
		});

		it('refusesTheOnlineAnnouncementOnceShutdownHasStarted', () => {
			const lifecycle = new StatusLifecycle();
			lifecycle.beginShutdown('SIGTERM');

			expect(lifecycle.tryBeginAnnounce()).toBe(false);
		});

		it('doesNotGoOnlineWhenShutdownStartedWhileAnnouncing', () => {
			const lifecycle = new StatusLifecycle();
			lifecycle.tryBeginAnnounce();
			lifecycle.beginShutdown('SIGTERM');

			expect(lifecycle.markOnlinePosted()).toBe(false);
		});
	});

	describe('shutdown', () => {
		it('postsOfflineOnlyAfterTheOnlineMessageWasPosted', () => {
			expect(onlineLifecycle().beginShutdown('SIGTERM')).toEqual({ postOffline: true, exitCode: 0 });
		});

		it('skipsOfflineWhenStoppedBeforeAnnouncing', () => {
			expect(new StatusLifecycle().beginShutdown('SIGTERM')).toEqual({ postOffline: false, exitCode: 0 });
		});

		it('skipsOfflineWhenStoppedWhileTheOnlineMessageWasInFlight', () => {
			const lifecycle = new StatusLifecycle();
			lifecycle.tryBeginAnnounce();

			expect(lifecycle.beginShutdown('SIGINT')).toEqual({ postOffline: false, exitCode: 0 });
		});

		it.each(['SIGTERM', 'SIGINT'] as const)('exitsWithZeroOnAPlannedStop (%s)', (trigger) => {
			expect(onlineLifecycle().beginShutdown(trigger)?.exitCode).toBe(0);
		});

		it.each(['uncaughtException', 'unhandledRejection'] as const)('exitsWithOneOnAnError (%s)', (trigger) => {
			expect(onlineLifecycle().beginShutdown(trigger)).toEqual({ postOffline: true, exitCode: 1 });
		});

		it('plansOnlyOneShutdownWhateverArrivesNext', () => {
			const lifecycle = onlineLifecycle();
			lifecycle.beginShutdown('SIGTERM');

			expect(lifecycle.beginShutdown('uncaughtException')).toBeNull();
			expect(lifecycle.beginShutdown('SIGINT')).toBeNull();
		});
	});
});
