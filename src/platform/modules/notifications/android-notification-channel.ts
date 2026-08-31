import { Capacitor } from '@capacitor/core';

import { logger } from '@platform/core/error';
import { NOTIFICATION_CHANNEL } from './notification.model';

const channelConfig = {
  lights: true,
  vibration: true,
  id: NOTIFICATION_CHANNEL.ID,
  name: NOTIFICATION_CHANNEL.NAME,
  importance: NOTIFICATION_CHANNEL.IMPORTANCE,
  visibility: NOTIFICATION_CHANNEL.VISIBILITY,
  description: NOTIFICATION_CHANNEL.DESCRIPTION,
};

/**
 * Creates a high-importance Android notification channel so alerts wake the screen.
 * Safe to call multiple times; channel settings are fixed after first creation.
 */
export async function ensureAndroidNotificationChannel(): Promise<void> {
  if (Capacitor.getPlatform() !== 'android') {
    return;
  }

  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    await LocalNotifications.createChannel(channelConfig);
  } catch (error) {
    logger.warn('[Notification] Failed to create Android channel via LocalNotifications', error);
  }

  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    await PushNotifications.createChannel(channelConfig);
  } catch (error) {
    logger.warn('[Notification] Failed to create Android channel via PushNotifications', error);
  }
}
