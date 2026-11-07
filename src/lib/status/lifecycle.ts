export type ShutdownTrigger = 'SIGTERM' | 'SIGINT' | 'uncaughtException' | 'unhandledRejection';

export interface ShutdownPlan {
	/** True only when this run's online message was posted, so every offline message pairs with an online one. */
	postOffline: boolean;
	/** 0 for a planned stop (SIGTERM, SIGINT), 1 for an error. */
	exitCode: 0 | 1;
}

type LifecycleState = 'starting' | 'announcing' | 'online' | 'shutting-down';

/**
 * Decides when status messages may be posted:
 * starting → announcing → online, and shutting-down from any state, at most once.
 */
export class StatusLifecycle {
	private state: LifecycleState = 'starting';

	/** True exactly once per process, so a repeated ready event cannot post a second online message. */
	public tryBeginAnnounce(): boolean {
		if (this.state !== 'starting') return false;
		this.state = 'announcing';
		return true;
	}

	/** Records that the online message was posted. False if shutdown has already started. */
	public markOnlinePosted(): boolean {
		if (this.state !== 'announcing') return false;
		this.state = 'online';
		return true;
	}

	/** The plan for the first stop trigger; null for every trigger after it. */
	public beginShutdown(trigger: ShutdownTrigger): ShutdownPlan | null {
		if (this.state === 'shutting-down') return null;
		const postOffline = this.state === 'online';
		this.state = 'shutting-down';
		return { postOffline, exitCode: trigger === 'SIGTERM' || trigger === 'SIGINT' ? 0 : 1 };
	}
}
