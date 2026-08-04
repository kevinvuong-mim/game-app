import { Capacitor } from '@capacitor/core';
import { logger } from '@platform/core/error';
import { i18n } from '@platform/modules/i18n';
import { deviceSyncService } from './device-sync.service';
import type { PluginListenerHandle } from '@capacitor/core';
import { ensureAndroidNotificationChannel } from './android-notification-channel';
import { mapLocaleToDeviceLocale, type PushNotificationPayload } from './notification.model';
import { notificationRepository, type NotificationRepository } from './notification.repository';

type PushActionHandler = (payload: PushNotificationPayload) => void;

class PushNotificationService {
  private listenersBound = false;
  private currentToken: string | null = null;
  private onAction: PushActionHandler | null = null;
  private onReceived: PushActionHandler | null = null;
  private listenerHandles: PluginListenerHandle[] = [];

  constructor(private readonly repository: NotificationRepository = notificationRepository) {}

  setHandlers(handlers: { onAction?: PushActionHandler; onReceived?: PushActionHandler }): void {
    this.onAction = handlers.onAction ?? null;
    this.onReceived = handlers.onReceived ?? null;
  }

  /**
   * System notification permission dialog only (no FCM register).
   * Used so bootstrap can show ATT → Notifications → UMP in sequence.
   */
  async requestPermission(): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) {
      return false;
    }

    try {
      const { PushNotifications } = await import('@capacitor/push-notifications');
      await ensureAndroidNotificationChannel();
      const permission = await PushNotifications.requestPermissions();
      const granted = permission.receive === 'granted';
      if (!granted) {
        logger.info('[PushNotification] Permission not granted');
      }
      return granted;
    } catch (error) {
      logger.warn('[PushNotification] Permission request failed', error);
      return false;
    }
  }

  async initialize(): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) {
      return false;
    }

    try {
      const granted = await this.requestPermission();
      if (!granted) {
        return false;
      }

      const { PushNotifications } = await import('@capacitor/push-notifications');

      if (!this.listenersBound) {
        await this.bindListeners();
        this.listenersBound = true;
      }

      await PushNotifications.register();
      await this.hydrateTokenFromStorage();
      return true;
    } catch (error) {
      logger.warn('[PushNotification] Init failed', error);
      return false;
    }
  }

  async syncDeviceState(): Promise<void> {
    const token = await this.resolveToken();
    if (!token) {
      return;
    }

    const locale = mapLocaleToDeviceLocale(i18n.getCurrentLanguage());
    const platform = this.repository.resolvePlatform();
    await deviceSyncService.enqueueRegister(token, platform, locale);
    void deviceSyncService.flush().catch(() => undefined);
  }

  async hasPermission(): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) {
      return false;
    }

    try {
      const { PushNotifications } = await import('@capacitor/push-notifications');
      const status = await PushNotifications.checkPermissions();
      return status.receive === 'granted';
    } catch {
      return false;
    }
  }

  async refreshTokenIfNeeded(): Promise<void> {
    const token = await this.resolveToken();
    if (!token) {
      return;
    }

    const locale = mapLocaleToDeviceLocale(i18n.getCurrentLanguage());
    const platform = this.repository.resolvePlatform();
    await deviceSyncService.enqueueRegister(token, platform, locale);
    void deviceSyncService.flush().catch(() => undefined);
  }

  async unregister(): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    try {
      const { PushNotifications } = await import('@capacitor/push-notifications');
      await deviceSyncService.enqueueUnregister();
      await PushNotifications.unregister();
      await PushNotifications.removeAllListeners();
      for (const handle of this.listenerHandles) {
        await handle.remove();
      }
      this.listenerHandles = [];
      this.listenersBound = false;
      void deviceSyncService.flush().catch(() => undefined);
      this.currentToken = null;
    } catch (error) {
      logger.warn('[PushNotification] Unregister failed', error);
    }
  }

  private async hydrateTokenFromStorage(): Promise<void> {
    if (this.currentToken) {
      return;
    }

    this.currentToken = await deviceSyncService.getPersistedToken();
  }

  private async resolveToken(): Promise<string | null> {
    await this.hydrateTokenFromStorage();
    return this.currentToken;
  }

  private async bindListeners(): Promise<void> {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    this.listenerHandles.push(
      await PushNotifications.addListener('registration', (event) => {
        this.currentToken = event.value;
        void this.syncDeviceState();
      }),
      await PushNotifications.addListener('registrationError', (error) => {
        logger.warn('[PushNotification] Registration error', error);
      }),
      await PushNotifications.addListener('pushNotificationReceived', (notification) => {
        const payload = this.extractPayload(notification.data);
        this.onReceived?.(payload);
      }),
      await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
        const payload = this.extractPayload(action.notification.data);
        this.onAction?.(payload);
      })
    );
  }

  private extractPayload(data?: Record<string, unknown>): PushNotificationPayload {
    const rankRaw = data?.rank;
    const rank =
      typeof rankRaw === 'number'
        ? rankRaw
        : typeof rankRaw === 'string' && rankRaw.trim() !== ''
          ? Number(rankRaw)
          : undefined;

    return {
      type:
        typeof data?.type === 'string' ? (data.type as PushNotificationPayload['type']) : undefined,
      route:
        typeof data?.route === 'string'
          ? (data.route as PushNotificationPayload['route'])
          : undefined,
      rank: typeof rank === 'number' && Number.isFinite(rank) ? rank : undefined,
    };
  }
}

export const pushNotificationService = new PushNotificationService();
