import { logger } from '@platform/core/error';
import { saveService } from '@platform/modules/save';
import type { IEventBus } from '@platform/core/events';
import { missions, type MissionService } from './mission.service';

class MissionController {
  constructor(private readonly service: MissionService = missions) {}

  bind(events: IEventBus): () => void {
    const unsubs = [
      events.on('ad:reward', ({ placement }) => {
        // Only mission placement counts toward WATCH_AD.
        if (placement === 'MISSION_WATCH') {
          void this.handleProgress('WATCH_AD', 1);
        }
      }),

      events.on('game:start', () => {
        void this.handleProgress('PLAY_GAME', 1);
      }),

      events.on('stars:earned', ({ stars }) => {
        void this.handleProgress('EARN_STARS', stars, 'set');
      }),

      events.on('merge', ({ count }) => {
        void this.handleProgress('MERGE', count ?? 1);
      }),

      events.on('player:name:updated', () => {
        void this.handleProgress('UPDATE_NAME', 1, 'set');
      }),

      events.on('app:resume', () => {
        void this.handleResets();
      }),
    ];

    return () => {
      for (const unsub of unsubs) unsub();
    };
  }

  private async handleProgress(
    type: string,
    amount: number,
    mode: 'increment' | 'set' = 'increment'
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
