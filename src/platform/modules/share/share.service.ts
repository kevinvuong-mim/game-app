import { logger } from '@platform/core/error';
import { getConfig } from '@platform/core/config';
import { getStoreListingUrl } from './share.config';
import { t } from '@platform/modules/i18n/i18n.service';

interface ShareScoreOptions {
  score: number;
  gameName: string;
  stars?: number;
  mapId?: number;
  level?: number;
}

type ShareScoreResult = 'shared' | 'cancelled' | 'unavailable';

class ShareService {
  /** Open the native share sheet with the player's score. */
  async shareScore({
    score,
    gameName,
    stars,
    mapId,
    level,
  }: ShareScoreOptions): Promise<ShareScoreResult> {
    const title = t('game.shareScoreTitle', { gameName });
    const text =
      stars !== undefined
        ? t('game.shareStarsText', { stars, map: mapId ?? 1, level: level ?? 1, gameName })
        : t('game.shareScoreText', { score, gameName });
    const dialogTitle = t('game.shareDialogTitle');
    const url = getStoreListingUrl(getConfig().storeListing) ?? undefined;

    try {
      const { Share } = await import('@capacitor/share');

      const canShare = await Share.canShare();
      if (!canShare.value) {
        logger.warn('[Share] Sharing is not available on this platform');
        return 'unavailable';
      }

      await Share.share({
        title,
        text,
        url,
        dialogTitle,
      });
      return 'shared';
    } catch (error) {
      if (isShareCancelled(error)) {
        return 'cancelled';
      }

      logger.warn('[Share] shareScore failed', error);
      return 'unavailable';
    }
  }
}

function isShareCancelled(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return message.includes('cancel') || message.includes('abort') || message.includes('dismiss');
}

export const shareService = new ShareService();
