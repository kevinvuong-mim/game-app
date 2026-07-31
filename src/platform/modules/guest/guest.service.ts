import { ApiError } from '@platform/core/api';
import { logger } from '@platform/core/error';
import { apiClient } from '@platform/core/api';
import { getConfig } from '@platform/core/config';
import { usePlatformStore } from '@platform/core/state';
import { saveService } from '@platform/modules/save';
import { guestRepository, type GuestRepository } from './guest.repository';
import { normalizePlayerName } from './guest.model';
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
  private createPromise: Promise<void> | null = null;
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

  /**
   * Saves the player name locally immediately. Syncs to the API when guest is ready
   * and online; queues until first guest create on fresh offline installs.
   */
  async updateName(name: string): Promise<UpdateNameResult> {
    const trimmed = normalizePlayerName(name);

    this.playerName = trimmed;
    usePlatformStore.getState().setUser({ displayName: trimmed });
    await saveService.saveLocal();

    const stored = await this.repository.loadCredentials();
    if (!stored) {
      await this.repository.savePendingName(trimmed);
      logger.info('[Guest] Name saved locally — waiting for guest identity');
      return { synced: false };
    }

    await this.repository.saveCredentials({
      ...stored,
      name: trimmed,
      nameSyncPending: true,
    });
    await this.repository.clearPendingName();

    if (this.guestStatus !== 'ready' || !this.guestId) {
      return { synced: false };
    }

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
      await this.repository.savePendingName(name);
      await saveService.saveLocal();
      return;
    }

    await this.repository.saveCredentials({
      ...stored,
      name,
      nameSyncPending: true,
    });
    await this.repository.clearPendingName();
    await saveService.saveLocal();
  }

  /** Promote a first-install offline name onto credentials once identity exists. */
  private async adoptPendingName(): Promise<void> {
    const pendingName = await this.repository.loadPendingName();
    if (!pendingName) return;

    await this.applyLocalName(pendingName);
    logger.info('[Guest] Adopted pending local name onto guest credentials');
  }

  private async runInit(): Promise<void> {
    try {
      const stored = await this.repository.loadCredentials();
      if (stored) {
        apiClient.setAuthToken(stored.secretToken);
        this.playerName = stored.name ?? (await this.repository.loadPendingName());
        this.markReady(stored.guestId);
        if (stored.name == null && this.playerName) {
          await this.adoptPendingName();
        }
        logger.info('[Guest] Loaded credentials from storage');
        // Defer name flush until App has loadLocal()'d — see App.init.
        return;
      }

      // No credentials yet — stay pending and never block cold start on /guest/init.
      this.guestStatus = 'pending';
      this.guestId = null;
      this.playerName = await this.repository.loadPendingName();
      apiClient.setAuthToken(null);
      void this.registerNetworkRetry();

      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        logger.info('[Guest] Offline first install — deferring guest create');
        return;
      }

      void this.createGuestIdentity();
    } catch (error) {
      this.guestStatus = 'pending';
      this.guestId = null;
      this.playerName = await this.repository.loadPendingName();
      apiClient.setAuthToken(null);
      logger.warn('[Guest] Failed to create guest identity (offline?)', error);
      void this.registerNetworkRetry();
    }
  }

  private async createGuestIdentity(): Promise<void> {
    if (this.guestStatus === 'ready') return;
    if (this.createPromise) return this.createPromise;

    this.createPromise = this.runCreateGuestIdentity().finally(() => {
      this.createPromise = null;
    });
    return this.createPromise;
  }

  private async runCreateGuestIdentity(): Promise<void> {
    if (this.guestStatus === 'ready') return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

    try {
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
      await this.adoptPendingName();
      logger.info('[Guest] Created new guest identity');
    } catch (error) {
      this.guestStatus = 'pending';
      this.guestId = null;
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

    // Offline score queue must not follow a new identity — drop orphans instead of rebinding.
    const { gameSyncRepository } = await import('@platform/modules/game-sync/game-sync.repository');
    await gameSyncRepository.clear();
    await notificationRepository.saveState(createDefaultNotificationState());
    logger.info('[Guest] Auth recovery — credentials and sync queue cleared');

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
