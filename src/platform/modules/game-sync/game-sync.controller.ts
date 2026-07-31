import { logger } from '@platform/core/error';
import { guest } from '@platform/modules/guest';
import type { IEventBus } from '@platform/core/events';
import type { PluginListenerHandle } from '@capacitor/core';
import { gameSync, type GameSyncService } from './game-sync.service';

/**
 * Bridges platform/lifecycle events to the sync service.
 *
 * - `game:over`  → persist the result locally, then flush in the background.
 * - `app:resume` → flush any pending results when the app foregrounds.
 * - network `online` → flush when connectivity is restored.
 */
class GameSyncController {
  private onlineHandler?: () => void;
  private networkListener?: PluginListenerHandle;

  constructor(private readonly service: GameSyncService = gameSync) {}

  bind(events: IEventBus): () => void {
    const unsubs = [
      events.on('game:over', ({ score, duration, merges }) => {
        const metadata: Record<string, number> = {
          duration: Math.round(duration / 1000),
        };
        if (typeof merges === 'number') metadata.merges = merges;

        // Start sync synchronously so GameOverScene.await flushAndGetRank() sees it.
        this.service.queueAndFlushResult({ score, metadata });
      }),

      events.on('app:resume', () => {
        void this.service.flush().catch(() => undefined);
      }),
    ];

    if (typeof window !== 'undefined') {
      this.onlineHandler = () => {
        logger.info('[GameSync] Network online — flushing queue');
        void this.service.flush().catch(() => undefined);
      };
      window.addEventListener('online', this.onlineHandler);
    }

    void this.bindNativeNetworkListener();

    const guestReadyUnsub = guest.onReady(() => {
      logger.info('[GameSync] Guest ready — flushing queue');
      void this.service.flush().catch(() => undefined);
    });

    // Attempt an initial flush in case results were queued in a previous session.
    void this.service.flush().catch(() => undefined);

    return () => {
      guestReadyUnsub();
      for (const unsub of unsubs) unsub();
      if (this.onlineHandler && typeof window !== 'undefined') {
        window.removeEventListener('online', this.onlineHandler);
        this.onlineHandler = undefined;
      }
      void this.networkListener?.remove();
      this.networkListener = undefined;
    };
  }

  private async bindNativeNetworkListener(): Promise<void> {
    try {
      const { Network } = await import('@capacitor/network');
      this.networkListener = await Network.addListener('networkStatusChange', ({ connected }) => {
        if (!connected) return;
        logger.info('[GameSync] Native network connected — flushing queue');
        void this.service.flush().catch(() => undefined);
      });
    } catch {
      // Web builds and older native shells keep using the window 'online' fallback.
    }
  }
}

export const gameSyncController = new GameSyncController();
