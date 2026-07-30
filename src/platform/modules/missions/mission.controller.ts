import { logger } from '@platform/core/error';
import type { IEventBus } from '@platform/core/events';
import { saveService } from '@platform/modules/save';
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

      events.on('app:resume', () => {
        void this.handleResetsAndLogin();
      }),
    ];

    return () => {
      for (const unsub of unsubs) unsub();
    };
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

  private async handleResetsAndLogin(): Promise<void> {
    const resetChanged = this.service.applyResets();
    const loginChanged = this.service.recordDailyLogin();
    if (!resetChanged && !loginChanged) return;

    await saveService.saveLocal();
    logger.debug('[MissionController] Reset/login saved');
  }
}

export const missionController = new MissionController();
