import type { PluginListenerHandle } from '@capacitor/core';

import { logger } from '@platform/core/error';
import type { IEventBus } from '@platform/core/events';
import { guest, type GuestService } from './guest.service';

/**
 * Flushes pending guest profile changes when connectivity returns.
 */
class GuestController {
  private onlineHandler?: () => void;
  private networkListener?: PluginListenerHandle;

  constructor(private readonly service: GuestService = guest) {}

  bind(events: IEventBus): () => void {
    const unsubs = [
      events.on('app:resume', () => {
        void this.service.flushPendingName();
      }),
    ];

    const guestReadyUnsub = this.service.onReady(() => {
      void this.service.flushPendingName();
    });

    if (typeof window !== 'undefined') {
      this.onlineHandler = () => {
        logger.info('[Guest] Network online — flushing pending name');
        void this.service.flushPendingName();
      };
      window.addEventListener('online', this.onlineHandler);
    }

    void this.bindNativeNetworkListener();

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
        void this.service.flushPendingName();
      });
    } catch {
      // Web builds use the window 'online' fallback.
    }
  }
}

export const guestController = new GuestController();
