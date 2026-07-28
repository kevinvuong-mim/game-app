import { ApiError } from '@platform/core/api';
import { logger } from '@platform/core/error';
import { apiClient } from '@platform/core/api';
import { getConfig } from '@platform/core/config';
import { usePlatformStore } from '@platform/core/state';
import { saveService } from '@platform/modules/save';
import { guestRepository, type GuestRepository } from './guest.repository';
import { notificationRepository } from '@platform/modules/notifications/notification.repository';
import { createDefaultNotificationState } from '@platform/modules/notifications/notification.model';

export type GuestStatus = 'ready' | 'pending';

type GuestReadyListener = (guestId: string) => void;

export interface UpdateNameResult {
  /** Server confirmed the name. */
  synced: boolean;
}

/**
 * Manages the anonymous guest identity.
 *
 * `init()` loads stored credentials or creates a new guest once per install.
 */
export class GuestService {
  private readonly readyListeners = new Set<GuestReadyListener>();

  private guestId: string | null = null;
  private playerName: string | null = null;
  private networkListenerRegistered = false;
  private guestStatus: GuestStatus = 'pending';
  private initPromise: Promise<void> | null = null;
  private recoveryPromise: Promise<boolean> | null = null;
  private nameFlushPromise: Promise<boolean> | null = null;

  constructor(private readonly repository: GuestRepository = guestRepository) {}

  async init(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this.runInit().finally(() => {
      this.initPromise = null;
    });

    return this.initPromise;
  }

  async recoverFromUnauthorized(): Promise<boolean> {
    if (this.recoveryPromise) {
      return this.recoveryPromise;
    }

    this.recoveryPromise = this.runRecovery().finally(() => {
      this.recoveryPromise = null;
    });

    return this.recoveryPromise;
  }

  getGuestId(): string | null {
    return this.guestId;
  }

  getName(): string | null {
    return this.playerName;
  }

  getStatus(): GuestStatus {
    return this.guestStatus;
  }

  onReady(listener: GuestReadyListener): () => void {
    if (this.guestStatus === 'ready' && this.guestId) {
      listener(this.guestId);
    }

    this.readyListeners.add(listener);
    return () => {
      this.readyListeners.delete(listener);
    };
  }

  async updateName(name: string): Promise<UpdateNameResult> {
    if (!this.guestId) {
      throw new Error('[Guest] Cannot update name before guest is ready');
    }

    const trimmed = name.trim();
    if (!trimmed) {
      throw new Error('[Guest] Name cannot be empty');
    }

    await this.applyLocalName(trimmed);
    const synced = await this.flushPendingName();
    return { synced };
  }

  async flushPendingName(): Promise<boolean> {
    if (this.nameFlushPromise) {
      return this.nameFlushPromise;
    }

    this.nameFlushPromise = this.runNameFlush().finally(() => {
      this.nameFlushPromise = null;
    });

    return this.nameFlushPromise;
  }

  private async runNameFlush(): Promise<boolean> {
    if (!this.guestId || this.guestStatus !== 'ready') {
      return false;
    }

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return false;
    }

    const stored = await this.repository.loadCredentials();
    if (!stored?.nameSyncPending || !stored.name) {
      return true;
    }

    try {
      const payload = await this.repository.updateName(stored.name);
      this.playerName = payload.name;

      await this.repository.saveCredentials({
        ...stored,
        name: payload.name,
        nameSyncPending: false,
      });

      usePlatformStore.getState().setUser({ displayName: payload.name ?? 'Player' });
      await saveService.saveLocal();
      return true;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        logger.warn('[Guest] Name sync failed — guest unauthorized');
      } else {
        logger.warn('[Guest] Name sync failed — will retry when online', error);
      }
      return false;
    }
  }

  private async applyLocalName(name: string): Promise<void> {
    this.playerName = name;
    usePlatformStore.getState().setUser({ displayName: name });

    const stored = await this.repository.loadCredentials();
    if (!stored) {
      return;
    }

    await this.repository.saveCredentials({
      ...stored,
      name,
      nameSyncPending: true,
    });

    await saveService.saveLocal();
  }

  private async runInit(): Promise<void> {
    try {
      const stored = await this.repository.loadCredentials();
      if (stored) {
        apiClient.setAuthToken(stored.secretToken);
        this.playerName = stored.name ?? null;
        this.markReady(stored.guestId);
        logger.info('[Guest] Loaded credentials from storage');
        // Defer name flush until App has loadLocal()'d — see App.init.
        return;
      }

      const { gameId } = getConfig();
      const payload = await this.repository.initGuest();

      if (payload.gameId !== gameId) {
        logger.warn('[Guest] Backend gameId mismatch', {
          expected: gameId,
          received: payload.gameId,
        });
      }

      await this.repository.saveCredentials({
        guestId: payload.guestId,
        secretToken: payload.secretToken,
      });
      apiClient.setAuthToken(payload.secretToken);
      this.markReady(payload.guestId);
      logger.info('[Guest] Created new guest identity');
    } catch (error) {
      this.guestStatus = 'pending';
      this.guestId = null;
      this.playerName = null;
      apiClient.setAuthToken(null);
      logger.warn('[Guest] Failed to create guest identity (offline?)', error);
      void this.registerNetworkRetry();
    }
  }

  private async runRecovery(): Promise<boolean> {
    await this.repository.clearCredentials();
    apiClient.setAuthToken(null);
    this.guestStatus = 'pending';
    this.guestId = null;
    this.playerName = null;

    // Offline score queue is keyed by guestId — flush rebinds orphans after identity change.
    await notificationRepository.saveState(createDefaultNotificationState());
    logger.info('[Guest] Auth recovery — credentials cleared');

    await this.init();
    const recovered = this.getStatus() === 'ready';
    if (recovered) {
      const { notificationService } =
        await import('@platform/modules/notifications/notification.service');
      await notificationService.rebindPushAfterGuestRecovery();
    }
    return recovered;
  }

  private markReady(guestId: string): void {
    this.guestId = guestId;
    this.guestStatus = 'ready';

    for (const listener of this.readyListeners) {
      listener(guestId);
    }
  }

  private async registerNetworkRetry(): Promise<void> {
    if (this.networkListenerRegistered) return;
    this.networkListenerRegistered = true;

    const retry = () => {
      if (this.guestStatus !== 'ready') {
        logger.info('[Guest] Network connected — retrying guest init');
        void this.init();
        return;
      }

      void this.flushPendingName();
    };

    try {
      const { Network } = await import('@capacitor/network');
      await Network.addListener('networkStatusChange', ({ connected }) => {
        if (!connected) return;
        retry();
      });
    } catch {
      if (typeof window === 'undefined') return;
      window.addEventListener('online', retry);
    }
  }
}

export const guest = new GuestService();
