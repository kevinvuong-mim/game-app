import {
  GUEST_STORAGE_KEY,
  type GuestCredentials,
  type InitGuestPayload,
  GUEST_PENDING_NAME_KEY,
  isValidGuestCredentials,
  type GuestProfilePayload,
} from './guest.model';
import { Capacitor } from '@capacitor/core';
import { logger } from '@platform/core/error';
import { storage } from '@platform/core/storage';
import { getConfig } from '@platform/core/config';
import type { ApiEnvelope } from '@platform/core/api';
import type { StorageProviderType } from '@platform/core/storage';
import { apiClient, unwrapSuccessEnvelope } from '@platform/core/api';

function guestStorageProvider(): StorageProviderType {
  return storage.getDurableProviderType();
}

/**
 * Owns guest credentials persistence and remote guest API calls.
 * Uses the same durable provider as game-save (Preferences native / IndexedDB web).
 */
export class GuestRepository {
  async loadCredentials(): Promise<GuestCredentials | null> {
    const durable = guestStorageProvider();
    let value = await storage.load<GuestCredentials>(GUEST_STORAGE_KEY, durable);

    if (!value && !Capacitor.isNativePlatform()) {
      value = await this.migrateFromLegacyLocalStorage(GUEST_STORAGE_KEY);
    }

    return isValidGuestCredentials(value) ? value : null;
  }

  async saveCredentials(credentials: GuestCredentials): Promise<void> {
    await storage.save(GUEST_STORAGE_KEY, credentials, guestStorageProvider());
  }

  async clearCredentials(): Promise<void> {
    await storage.remove(GUEST_STORAGE_KEY, guestStorageProvider());
    if (!Capacitor.isNativePlatform()) {
      await storage.remove(GUEST_STORAGE_KEY, 'localStorage');
    }
  }

  async loadPendingName(): Promise<string | null> {
    const durable = guestStorageProvider();
    let value = await storage.load<string>(GUEST_PENDING_NAME_KEY, durable);

    if ((value === null || value === undefined) && !Capacitor.isNativePlatform()) {
      value = await this.migrateFromLegacyLocalStorage(GUEST_PENDING_NAME_KEY);
    }

    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  async savePendingName(name: string): Promise<void> {
    await storage.save(GUEST_PENDING_NAME_KEY, name.trim(), guestStorageProvider());
  }

  async clearPendingName(): Promise<void> {
    await storage.remove(GUEST_PENDING_NAME_KEY, guestStorageProvider());
    if (!Capacitor.isNativePlatform()) {
      await storage.remove(GUEST_PENDING_NAME_KEY, 'localStorage');
    }
  }

  async initGuest(): Promise<InitGuestPayload> {
    const { gameId } = getConfig();
    const envelope = await apiClient.post<ApiEnvelope<InitGuestPayload>>(
      '/guest/init',
      { gameId },
      { auth: false, retries: 0 }
    );
    const payload = unwrapSuccessEnvelope(envelope);

    if (!payload?.guestId || !payload.secretToken) {
      throw new Error('[Guest] /guest/init returned invalid identity');
    }

    return payload;
  }

  async updateName(name: string): Promise<GuestProfilePayload> {
    const envelope = await apiClient.patch<ApiEnvelope<GuestProfilePayload>>('/guest/name', {
      name,
    });
    return unwrapSuccessEnvelope(envelope);
  }

  private async migrateFromLegacyLocalStorage<T>(key: string): Promise<T | null> {
    const legacy = await storage.load<T>(key, 'localStorage');
    if (legacy === null || legacy === undefined) return null;

    await storage.save(key, legacy, guestStorageProvider());
    await storage.remove(key, 'localStorage');
    logger.info(`[Guest] Migrated ${key} from localStorage to durable storage`);
    return legacy;
  }
}

export const guestRepository = new GuestRepository();
