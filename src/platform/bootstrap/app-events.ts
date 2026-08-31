import { Capacitor } from '@capacitor/core';

import {
  trackAdReward,
  trackGameOver,
  trackPurchase,
  trackGameStart,
  trackSessionEnd,
  trackMissionComplete,
} from '@platform/core/analytics/events';
import { logger } from '@platform/core/error';
import { services } from '@platform/core/services';
import { saveService } from '@platform/modules/save';
import { usePlatformStore } from '@platform/core/state';
import { gameRunService } from '@platform/modules/game-run';
import { leaderboard } from '@platform/modules/leaderboard';
import { dailyRewards } from '@platform/modules/daily-reward';
import { hideNativeSplash } from '@platform/bootstrap/capacitor';

const { events, analytics } = services;

export function bindAppEvents(): () => void {
  const unsubs = [
    events.on('analytics', ({ event, params }) => {
      analytics.track(event, params);
    }),

    events.on('app:ready', () => {
      logger.info('[App] Game shell ready');
      void hideNativeSplash();
      events.emit('ad:show:request', { placement: 'HOME' });
    }),

    events.on('score:update', ({ score }) => {
      const before = usePlatformStore.getState().progress.highScore;
      usePlatformStore.getState().setHighScore(score);
      // Checkpoint new PBs mid-run — OS may not deliver pause before a kill.
      if (usePlatformStore.getState().progress.highScore > before) {
        void saveService.saveLocal();
      }
    }),

    events.on('game:start', () => {
      usePlatformStore.getState().incrementGamesPlayed();
      trackGameStart();
    }),

    events.on('game:over', async ({ score, duration, merges }) => {
      // Apply score before save — do not rely on a later score:update ordering.
      usePlatformStore.getState().setHighScore(score);
      // 1 point = 1 coin at end of run.
      if (score > 0) {
        usePlatformStore.getState().addCoins(score);
      }
      trackGameOver({ score, duration, merges });
      events.emit('ad:show:request', { placement: 'GAME_OVER' });
      await saveService.saveLocal();
    }),

    events.on('mission:complete', ({ missionId }) => {
      trackMissionComplete({ missionId });
    }),

    events.on('settings:change', () => {
      void saveService.saveLocal();
    }),

    events.on('shop:purchase', ({ itemId, price }) => {
      trackPurchase({ itemId, price });
      void saveService.saveLocal();
    }),

    events.on('shop:restore', () => {
      void saveService.saveLocal();
    }),

    events.on('game:destroy', () => {
      void saveService.saveLocal();
    }),

    events.on('ad:reward', ({ placement, reward }) => {
      trackAdReward({ placement, reward: JSON.stringify(reward) });
      // Persist after rewarded grants (e.g. Game Over x2 coins) and mission progress.
      void saveService.saveLocal();
    }),

    events.on('app:resume', () => {
      dailyRewards.refreshOnResume();
      void leaderboard.fetchLeaderboard({ force: false }).catch(() => undefined);
    }),
  ];

  return () => {
    for (const unsub of unsubs) unsub();
  };
}

export function bindAppLifecycle(): () => void {
  if (typeof document === 'undefined' || Capacitor.isNativePlatform()) {
    return () => {};
  }

  const onVisibilityChange = () => {
    if (document.hidden) {
      trackSessionEnd();
      events.emit('app:pause', undefined);
      void gameRunService.flush();
      void saveService.saveLocal();
      void analytics.flush();
    } else {
      events.emit('app:resume', undefined);
    }
  };

  document.addEventListener('visibilitychange', onVisibilityChange);

  return () => {
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };
}
