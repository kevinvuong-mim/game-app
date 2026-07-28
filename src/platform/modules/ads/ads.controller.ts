import { adsModule } from './ads.service';
import type { IEventBus } from '@platform/core/events';
import { usePlatformStore } from '@platform/core/state';
import { saveService } from '@platform/modules/save';

export function bindAdsController(events: IEventBus): () => void {
  const unsubs = [
    events.on('ad:reward:request', async ({ placement }) => {
      const result = await adsModule.requestReward(placement);
      events.emit('ad:reward:result', {
        placement,
        reward: result.reward,
        success: result.success,
        message: result.message,
      });

      if (result.success && result.reward) {
        if (result.reward.type === 'coins') {
          usePlatformStore.getState().addCoins(result.reward.amount);
          await saveService.saveLocal();
        }
        events.emit('ad:reward', { placement, reward: result.reward });
      }
    }),

    events.on('ad:show:request', async ({ placement }) => {
      await adsModule.showPlacement(placement);
    }),

    events.on('ad:context:change', ({ context }) => {
      void adsModule.applyBannerForContext(context);
    }),
  ];

  return () => {
    for (const unsub of unsubs) unsub();
  };
}
