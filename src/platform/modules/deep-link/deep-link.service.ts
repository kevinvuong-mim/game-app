import { logger } from '@platform/core/error';
import { eventBus } from '@platform/core/events';
import { getConfig } from '@platform/core/config';
import { navigationService } from '@platform/modules/navigation/navigation.service';

import {
  type DeepLinkSource,
  type DeepLinkPayload,
  buildDeepLinkSceneData,
} from './deep-link.model';
import { parseDeepLinkUrl } from './deep-link.parser';

class DeepLinkService {
  private bootComplete = false;
  private pendingDeepLink: DeepLinkPayload | null = null;

  peekPendingDeepLink(): DeepLinkPayload | null {
    return this.pendingDeepLink;
  }

  consumePendingDeepLink(): DeepLinkPayload | null {
    const pending = this.pendingDeepLink;
    this.pendingDeepLink = null;
    return pending;
  }

  markBootComplete(): void {
    this.bootComplete = true;
  }

  isBootComplete(): boolean {
    return this.bootComplete;
  }

  handleUrl(url: string, source: DeepLinkSource): boolean {
    const parsed = parseDeepLinkUrl(url, getConfig().deepLink, source);
    if (!parsed) {
      logger.warn('[DeepLink] Ignored unsupported URL', { url, source });
      return false;
    }

    this.pendingDeepLink = parsed;
    logger.info('[DeepLink] Received', {
      scene: parsed.scene,
      path: parsed.path,
      source: parsed.source,
    });

    if (!this.bootComplete) {
      navigationService.navigateToScene(parsed.scene, buildDeepLinkSceneData(parsed));
      return true;
    }

    eventBus.emit('deeplink:open', parsed);
    this.pendingDeepLink = null;
    return true;
  }

  flushPendingDeepLink(): void {
    if (!this.bootComplete || !this.pendingDeepLink) {
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
