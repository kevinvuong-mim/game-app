import {
  GUEST_STORAGE_KEY,
  GUEST_PENDING_NAME_KEY,
  type GuestCredentials,
  type InitGuestPayload,
  isValidGuestCredentials,
  type GuestProfilePayload,
} from './guest.model';
import { Capacitor } from '@capacitor/core';
import { storage } from '@platform/core/storage';
import { getConfig } from '@platform/core/config';
import type { ApiEnvelope } from '@platform/core/api';
import type { StorageProviderType } from '@platform/core/storage';
import { apiClient, unwrapSuccessEnvelope } from '@platform/core/api';

function guestStorageProvider(): StorageProviderType {
  return Capacitor.isNativePlatform() ? 'preferences' : 'localStorage';
}

/**
 * Owns guest credentials persistence and remote guest API calls.
 */
export class GuestRepository {
  async loadCredentials(): Promise<GuestCredentials | null> {
    const value = await storage.load<GuestCredentials>(GUEST_STORAGE_KEY, guestStorageProvider());
    return isValidGuestCredentials(value) ? value : null;
  }

  async saveCredentials(credentials: GuestCredentials): Promise<void> {
    await storage.save(GUEST_STORAGE_KEY, credentials, guestStorageProvider());
  }

  async clearCredentials(): Promise<void> {
    await storage.remove(GUEST_STORAGE_KEY, guestStorageProvider());
  }

  async loadPendingName(): Promise<string | null> {
    const value = await storage.load<string>(GUEST_PENDING_NAME_KEY, guestStorageProvider());
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  async savePendingName(name: string): Promise<void> {
    await storage.save(GUEST_PENDING_NAME_KEY, name.trim(), guestStorageProvider());
  }

  async clearPendingName(): Promise<void> {
    await storage.remove(GUEST_PENDING_NAME_KEY, guestStorageProvider());
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
}

export const guestRepository = new GuestRepository();
