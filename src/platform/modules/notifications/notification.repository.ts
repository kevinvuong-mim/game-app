import { Capacitor } from '@capacitor/core';

import {
  type DeviceLocale,
  type DevicePlatform,
  type NotificationState,
  NOTIFICATION_STORAGE_KEY,
  normalizeNotificationState,
  createDefaultNotificationState,
} from './notification.model';
import { ApiError } from '@platform/core/api';
import { storage } from '@platform/core/storage';
import type { ApiEnvelope } from '@platform/core/api';
import { apiClient, unwrapSuccessEnvelope } from '@platform/core/api';

interface RegisterDeviceResponse {
  guestId: string;
}

export class NotificationRepository {
  async loadState(): Promise<NotificationState> {
    const value = await storage.load<unknown>(NOTIFICATION_STORAGE_KEY);
    return normalizeNotificationState(value);
  }

  async saveState(state: NotificationState): Promise<void> {
    await storage.save(NOTIFICATION_STORAGE_KEY, state);
  }

  resolvePlatform(): DevicePlatform {
    return Capacitor.getPlatform() === 'ios' ? 'IOS' : 'ANDROID';
  }

  async syncDeviceRegistration(state: NotificationState): Promise<void> {
    const { pendingToken, pendingLocale, platform, lastSyncedToken } = state;
    if (!pendingToken || !pendingLocale || !platform) {
      throw new Error('[Notification] Missing pending device registration data');
    }

    if (!lastSyncedToken || lastSyncedToken !== pendingToken) {
      await this.registerDevice(pendingToken, platform, pendingLocale);
      return;
    }

    if (state.lastSyncedLocale === pendingLocale) {
      return;
    }

    try {
      await this.updateDevice(pendingToken, pendingLocale);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        await this.registerDevice(pendingToken, platform, pendingLocale);
        return;
      }
      throw error;
    }
  }

  async registerDevice(token: string, platform: DevicePlatform, locale: DeviceLocale) {
    const envelope = await apiClient.post<ApiEnvelope<RegisterDeviceResponse>>('/devices', {
      token,
      platform,
      locale,
    });
    return unwrapSuccessEnvelope(envelope);
  }

  async updateDevice(token: string, locale: DeviceLocale) {
    const envelope = await apiClient.patch<ApiEnvelope<RegisterDeviceResponse>>('/devices', {
      token,
      locale,
    });
    return unwrapSuccessEnvelope(envelope);
  }

  async unregisterDevice() {
    await apiClient.delete('/devices');
  }

  async clearState(): Promise<void> {
    await storage.save(NOTIFICATION_STORAGE_KEY, createDefaultNotificationState());
  }
}

export const notificationRepository = new NotificationRepository();
