import {
  deviceSyncNeeded,
  type DeviceLocale,
  type DevicePlatform,
  type NotificationState,
  MAX_DEVICE_SYNC_ATTEMPTS,
  MAX_DEVICE_SYNC_BACKOFF_MS,
  BASE_DEVICE_SYNC_BACKOFF_MS,
  createDefaultNotificationState,
} from './notification.model';
import { ApiError } from '@platform/core/api';
import { logger } from '@platform/core/error';
import { guest, type GuestService } from '@platform/modules/guest';
import { notificationRepository, type NotificationRepository } from './notification.repository';

/**
 * Offline-first FCM device token sync.
 *
 * Persists desired device state locally and flushes to `/devices`
 * when guest is ready and network is available.
 */
class DeviceSyncService {
  private flushing = false;
  private dirty = false;

  constructor(
    private readonly repository: NotificationRepository = notificationRepository,
    private readonly guestService: GuestService = guest
  ) {}

  async loadState(): Promise<NotificationState> {
    return this.repository.loadState();
  }

  async getPersistedToken(): Promise<string | null> {
    const state = await this.loadState();
    return state.pendingToken ?? state.lastSyncedToken;
  }

  async enqueueRegister(
    token: string,
    platform: DevicePlatform,
    locale: DeviceLocale
  ): Promise<void> {
    const state = await this.loadState();

    await this.repository.saveState({
      ...state,
      platform,
      syncAttempts: 0,
      pendingToken: token,
      pendingLocale: locale,
      unregisterPending: false,
      lastErrorCode: undefined,
      nextAttemptAt: undefined,
    });

    logger.debug('[DeviceSync] Device registration queued', { platform, locale });
  }

  async enqueueUnregister(): Promise<void> {
    const state = await this.loadState();

    await this.repository.saveState({
      ...state,
      syncAttempts: 0,
      unregisterPending: true,
      lastErrorCode: undefined,
      nextAttemptAt: undefined,
    });
  }

  async flush(): Promise<void> {
    if (this.flushing) {
      this.dirty = true;
      return;
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

    if (this.guestService.getStatus() !== 'ready' || !this.guestService.getGuestId()) {
      logger.debug('[DeviceSync] Flush skipped — guest not ready');
      return;
    }

    this.flushing = true;
    try {
      do {
        this.dirty = false;

        const state = await this.loadState();
        if (!this.hasPendingWork(state)) {
          continue;
        }

        if (state.nextAttemptAt && Date.parse(state.nextAttemptAt) > Date.now()) {
          continue;
        }

        if (state.syncAttempts >= MAX_DEVICE_SYNC_ATTEMPTS) {
          logger.warn('[DeviceSync] Max sync attempts reached — giving up until next enqueue');
          continue;
        }

        await this.flushState(state);
      } while (this.dirty);
    } finally {
      this.flushing = false;
    }
  }

  private hasPendingWork(state: NotificationState): boolean {
    return state.unregisterPending || deviceSyncNeeded(state);
  }

  private async flushState(state: NotificationState): Promise<void> {
    let current = state;

    try {
      if (current.unregisterPending) {
        current = await this.flushUnregister(current);
        return;
      }

      if (deviceSyncNeeded(current)) {
        current = await this.flushDeviceRegistration(current);
      }
    } catch (error) {
      current = await this.markAttemptFailed(current, error);
      logger.warn('[DeviceSync] Flush failed, will retry later', error);
    }
  }

  private async flushUnregister(_state: NotificationState): Promise<NotificationState> {
    await this.repository.unregisterDevice();
    await this.repository.clearState();
    logger.info('[DeviceSync] Device unregistered');
    return createDefaultNotificationState();
  }

  private async flushDeviceRegistration(state: NotificationState): Promise<NotificationState> {
    const { pendingToken, pendingLocale, platform } = state;
    if (!pendingToken || !pendingLocale || !platform) {
      return state;
    }

    await this.repository.syncDeviceRegistration(state);

    const synced: NotificationState = {
      ...state,
      syncAttempts: 0,
      lastAttemptAt: undefined,
      lastErrorCode: undefined,
      nextAttemptAt: undefined,
      lastSyncedToken: pendingToken,
      lastSyncedLocale: pendingLocale,
    };

    await this.repository.saveState(synced);
    logger.info('[DeviceSync] Device registration synced');
    return synced;
  }

  private async markAttemptFailed(
    state: NotificationState,
    error: unknown
  ): Promise<NotificationState> {
    const syncAttempts = state.syncAttempts + 1;
    const backoffMs = Math.min(
      MAX_DEVICE_SYNC_BACKOFF_MS,
      BASE_DEVICE_SYNC_BACKOFF_MS * 2 ** Math.max(0, syncAttempts - 1)
    );
    const now = Date.now();
    const errorCode = error instanceof ApiError ? String(error.status) : 'network';

    if (error instanceof ApiError && error.status === 401) {
      logger.error('[DeviceSync] Guest auth failed — credentials may be invalid', error);
    }

    const failed: NotificationState = {
      ...state,
      syncAttempts,
      lastErrorCode: errorCode,
      lastAttemptAt: new Date(now).toISOString(),
      nextAttemptAt: new Date(now + backoffMs).toISOString(),
    };

    await this.repository.saveState(failed);
    return failed;
  }
}

export const deviceSyncService = new DeviceSyncService();
