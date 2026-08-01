import { logger } from '@platform/core/error';
import type { IEventBus } from '@platform/core/events';
import { trackDailyClaim } from '@platform/core/analytics/events';
import { dailyRewards, type DailyRewardService } from './daily-reward.service';

class DailyRewardController {
  constructor(private readonly service: DailyRewardService = dailyRewards) {}

  bind(events: IEventBus): () => void {
    const unsubs = [
      events.on('daily:progress:request', () => {
        this.emitProgress(events);
      }),

      events.on('daily:claim:request', async () => {
        await this.handleClaim(events);
      }),

      events.on('app:resume', () => {
        this.service.refreshOnResume();
        this.emitProgress(events);
      }),
    ];

    return () => {
      for (const unsub of unsubs) unsub();
    };
  }

  private emitProgress(events: IEventBus): void {
    events.emit('daily:progress', this.service.getRewardProgress());
  }

  private async handleClaim(events: IEventBus): Promise<void> {
    const result = await this.service.claim();

    if (!result) {
      const progress = this.service.getRewardProgress();
      events.emit('daily:claim:result', {
        success: false,
        message: progress.canClaim ? 'claim_failed' : 'already_claimed',
      });
      this.emitProgress(events);
      return;
    }

    trackDailyClaim({
      day: result.day,
      coins: result.coins,
    });

    events.emit('daily:claim:result', {
      success: true,
      day: result.day,
      coins: result.coins,
    });

    this.emitProgress(events);
    logger.info('[DailyRewardController] Claim handled', result);
  }
}

export const dailyRewardController = new DailyRewardController();
