import { logger } from '@platform/core/error';
import { saveService } from '@platform/modules/save';
import type { IEventBus } from '@platform/core/events';
import { missions, type MissionService } from './mission.service';
import { missionTracker, type MissionTracker } from './mission.tracker';

class MissionController {
  constructor(
    private readonly service: MissionService = missions,
    private readonly tracker: MissionTracker = missionTracker
  ) {}

  bind(events: IEventBus): () => void {
    const unsubs = [
      this.tracker.bind(events, (type, amount, mode) => {
        void this.handleProgress(type, amount, mode ?? 'increment');
      }),

      events.on('mission:claim:request', async ({ missionId }) => {
        await this.handleClaim(events, missionId);
      }),

      events.on('app:resume', () => {
        void this.handleResets();
      }),
    ];

    return () => {
      for (const unsub of unsubs) unsub();
    };
  }

  private async handleClaim(events: IEventBus, missionId: string): Promise<void> {
    const success = this.service.claimMission(missionId);

    if (!success) {
      events.emit('mission:claim:result', {
        missionId,
        success: false,
        message: 'claim_failed',
      });
      return;
    }

    await saveService.saveLocal();

    events.emit('mission:claim:result', {
      missionId,
      success: true,
    });

    logger.info('[MissionController] Claim handled', { missionId });
  }

  private async handleProgress(
    type: string,
    amount: number,
    mode: 'increment' | 'set'
  ): Promise<void> {
    const updated =
      mode === 'set'
        ? this.service.setProgressByType(type, amount)
        : this.service.incrementProgressByType(type, amount);
    if (!updated) return;

    await saveService.saveLocal();
    logger.debug('[MissionController] Progress saved', { type, amount, mode });
  }

  private async handleResets(): Promise<void> {
    let changed = this.service.applyResets();
    if (this.service.recordDailyLogin()) changed = true;
    if (!changed) return;

    await saveService.saveLocal();
    logger.debug('[MissionController] Reset saved');
  }
}

export const missionController = new MissionController();
