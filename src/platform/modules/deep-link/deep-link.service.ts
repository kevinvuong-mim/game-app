import {
  type DeepLinkSource,
  type DeepLinkPayload,
  buildDeepLinkSceneData,
} from './deep-link.model';
import { logger } from '@platform/core/error';
import { getConfig } from '@platform/core/config';
import { parseDeepLinkUrl } from './deep-link.parser';
import { eventBus, type IEventBus } from '@platform/core/events';
import { navigationService } from '@platform/modules/navigation/navigation.service';

class DeepLinkService {
  private pendingDeepLink: DeepLinkPayload | null = null;

  handleUrl(url: string, source: DeepLinkSource): boolean {
    const parsed = parseDeepLinkUrl(url, getConfig().deepLink, source);
    if (!parsed) {
      logger.warn('[DeepLink] Ignored unsupported URL', { url, source });
      return false;
    }

    // iOS/Android often fire appUrlOpen with the same launch URL as getLaunchUrl.
    // Do not overwrite cold_start — flushPendingDeepLink would then emit a second navigate.
    if (
      source === 'app_url_open' &&
      this.pendingDeepLink?.source === 'cold_start' &&
      this.pendingDeepLink.scene === parsed.scene &&
      this.pendingDeepLink.path === parsed.path
    ) {
      logger.info('[DeepLink] Ignored duplicate launch URL', {
        scene: parsed.scene,
        path: parsed.path,
        source,
      });
      return true;
    }

    this.pendingDeepLink = parsed;
    logger.info('[DeepLink] Received', {
      scene: parsed.scene,
      path: parsed.path,
      source: parsed.source,
    });

    if (!navigationService.isBootComplete()) {
      navigationService.navigateToScene(parsed.scene, buildDeepLinkSceneData(parsed));
      return true;
    }

    eventBus.emit('deeplink:open', parsed);
    this.pendingDeepLink = null;
    return true;
  }

  bind(events: IEventBus): () => void {
    const unsubs = [
      events.on('deeplink:open', (payload) => {
        logger.info('[DeepLink] Navigating from deeplink', {
          path: payload.path,
          scene: payload.scene,
        });
        navigationService.navigateToScene(payload.scene, buildDeepLinkSceneData(payload));
      }),

      events.on('boot:preload-complete', () => {
        this.flushPendingDeepLink();
      }),
    ];

    return () => {
      for (const unsub of unsubs) unsub();
    };
  }

  /** Called from `boot:preload-complete` — Preload already peeked/started cold_start targets. */
  private flushPendingDeepLink(): void {
    if (!this.pendingDeepLink) {
      return;
    }

    if (this.pendingDeepLink.source === 'cold_start') {
      this.pendingDeepLink = null;
      return;
    }

    eventBus.emit('deeplink:open', this.pendingDeepLink);
    this.pendingDeepLink = null;
  }
}

export const deepLinkService = new DeepLinkService();
