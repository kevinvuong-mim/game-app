import {
  MAX_BATCH_SIZE,
  sanitizeMetadata,
  toNonNegativeInt,
  MAX_SYNC_ATTEMPTS,
  isValidReplaySecret,
  type ResultSubmitData,
  computeReplaySignature,
  type PendingGameResult,
} from './game-sync.model';
import { ApiError } from '@platform/core/api';
import { logger } from '@platform/core/error';
import { eventBus } from '@platform/core/events';
import { generateId } from '@platform/core/utils';
import { getConfig } from '@platform/core/config';
import { leaderboard } from '@platform/modules/leaderboard';
import { guest, type GuestService } from '@platform/modules/guest';
import { gameSyncRepository, type GameSyncRepository } from './game-sync.repository';

const BASE_SYNC_BACKOFF_MS = 30_000;
const MAX_SYNC_BACKOFF_MS = 30 * 60 * 1000;

export interface RecordResultParams {
  score: number;
  playedAt?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Offline-first match-result sync.
 */
export class GameSyncService {
  private flushing = false;
  private dirty = false;

  constructor(
    private readonly repository: GameSyncRepository = gameSyncRepository,
    private readonly guestService: GuestService = guest
  ) {}

  async recordResult(params: RecordResultParams): Promise<void> {
    const { gameId } = getConfig();
    // Empty guestId is an unsigned marker; flush() rebinds when guest becomes ready.
    const guestId = this.guestService.getGuestId() ?? '';
    const score = toNonNegativeInt(params.score);
    const playedAt = params.playedAt ?? new Date().toISOString();
    const clientResultId = generateId('result');

    const result: PendingGameResult = {
      localId: clientResultId,
      clientResultId,
      gameId,
      guestId,
      score,
      playedAt,
      metadata: params.metadata,
      synced: false,
      syncAttempts: 0,
      createdAt: playedAt,
    };

    const queue = await this.repository.loadQueue();
    queue.push(result);
    await this.repository.saveQueue(queue);
    logger.debug('[GameSync] Result queued', { clientResultId, score });
  }

  async flush(): Promise<void> {
    if (this.flushing) {
      this.dirty = true;
      return;
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

    const gameId = getConfig().gameId;
    const guestId = this.guestService.getGuestId();
    if (!guestId || this.guestService.getStatus() !== 'ready') {
      logger.debug('[GameSync] Flush skipped — guest not ready');
      return;
    }

    this.flushing = true;
    try {
      do {
        this.dirty = false;
        await this.flushForGuest(gameId, guestId);
      } while (this.dirty);
    } finally {
      this.flushing = false;
    }
  }

  private async flushForGuest(gameId: string, guestId: string): Promise<void> {
    const { replaySecret } = getConfig();
    if (!isValidReplaySecret(replaySecret)) {
      logger.error(
        '[GameSync] Invalid or missing VITE_REPLAY_SECRET — refusing to sync (queue preserved)'
      );
      return;
    }

    let queue = await this.repository.loadQueue();

    // Re-bind orphans from a previous guest on this install (e.g. after 401 recovery).
    // Signatures are recomputed below with the current guestId.
    const orphanCount = queue.filter(
      (item) => !item.synced && item.gameId === gameId && !!item.guestId && item.guestId !== guestId
    ).length;
    if (orphanCount > 0) {
      logger.warn('[GameSync] Rebinding orphaned results to current guest', {
        count: orphanCount,
      });
      queue = queue.map((item) =>
        !item.synced && item.gameId === gameId && !!item.guestId && item.guestId !== guestId
          ? { ...item, guestId, syncAttempts: 0, nextAttemptAt: undefined }
          : item
      );
    }

    // Bind unsigned/local rows that never got a guestId to the current identity.
    queue = queue.map((item) =>
      !item.synced && item.gameId === gameId && !item.guestId ? { ...item, guestId } : item
    );

    const now = Date.now();
    const pending = queue.filter(
      (r) =>
        !r.synced &&
        r.gameId === gameId &&
        r.guestId === guestId &&
        r.syncAttempts < MAX_SYNC_ATTEMPTS &&
        (!r.nextAttemptAt || Date.parse(r.nextAttemptAt) <= now)
    );
    if (pending.length === 0) {
      await this.repository.saveQueue(queue);
      return;
    }

    for (let i = 0; i < pending.length; i += MAX_BATCH_SIZE) {
      const batch = pending.slice(i, i + MAX_BATCH_SIZE);
      const signedBatch = await Promise.all(
        batch.map(async (item) => ({
          ...item,
          guestId,
          signature: await computeReplaySignature({
            gameId,
            guestId,
            clientResultId: item.clientResultId,
            score: item.score,
            playedAt: item.playedAt,
            replaySecret,
          }),
        }))
      );

      try {
        const response = await this.repository.sync(
          gameId,
          signedBatch.map(({ clientResultId, score, playedAt, signature, metadata }) => ({
            clientResultId,
            score,
            playedAt,
            signature,
            metadata: sanitizeMetadata(metadata),
          }))
        );

        queue = this.applyBatchSyncResults(queue, batch, response, gameId, guestId);
        this.handleSyncRank(response);
        queue = this.pruneQueue(queue);
        await this.repository.saveQueue(queue);
      } catch (error) {
        this.logExpectedApiErrors(error);
        queue = this.incrementAttempts(queue, batch, gameId, error);
        queue = this.pruneQueue(queue);
        await this.repository.saveQueue(queue);
        logger.warn('[GameSync] Batch sync failed, will retry later', error);
        throw error;
      }
    }
  }

  private logExpectedApiErrors(error: unknown): void {
    if (error instanceof ApiError && error.status === 404) {
      logger.error('[GameSync] Game not found on backend — check gameId config', error);
    }
    if (error instanceof ApiError && error.status === 401) {
      logger.error('[GameSync] Guest auth failed — credentials may be invalid', error);
    }
  }

  private handleSyncRank(response: ResultSubmitData): void {
    if (typeof response.rank !== 'number' || typeof response.bestScore !== 'number') {
      return;
    }

    leaderboard.updateSelfRank(response.rank, response.bestScore);
    eventBus.emit('game:sync:completed', {
      rank: response.rank,
      bestScore: response.bestScore,
    });
  }

  private applyBatchSyncResults(
    queue: PendingGameResult[],
    batch: PendingGameResult[],
    response: ResultSubmitData,
    gameId: string,
    guestId: string
  ): PendingGameResult[] {
    const rejectedById = new Map(
      (response.rejected ?? []).map((item) => [item.clientResultId, item.reason])
    );
    const batchIds = new Set(batch.map((item) => item.localId));

    return queue.flatMap((item) => {
      if (!batchIds.has(item.localId) || item.gameId !== gameId) {
        return [item];
      }

      const rejectReason = rejectedById.get(item.clientResultId);
      if (rejectReason === 'invalid_signature') {
        // Likely config/secret mismatch or stale guest HMAC — keep queue, back off.
        logger.error(
          '[GameSync] Result rejected (invalid_signature) — keeping in queue; check VITE_REPLAY_SECRET',
          { clientResultId: item.clientResultId }
        );
        return [this.markAttemptFailed(item, 'invalid_signature')];
      }

      if (rejectReason) {
        logger.warn('[GameSync] Result rejected', {
          clientResultId: item.clientResultId,
          reason: rejectReason,
        });
        return [];
      }

      return [{ ...item, synced: true, guestId }];
    });
  }

  private pruneQueue(queue: PendingGameResult[]): PendingGameResult[] {
    const kept: PendingGameResult[] = [];

    for (const item of queue) {
      if (item.synced) {
        continue;
      }

      if (item.syncAttempts >= MAX_SYNC_ATTEMPTS) {
        eventBus.emit('game:sync:dropped', {
          clientResultId: item.clientResultId,
          attempts: item.syncAttempts,
        });
        continue;
      }

      kept.push(item);
    }

    return kept;
  }

  private incrementAttempts(
    queue: PendingGameResult[],
    batch: PendingGameResult[],
    gameId: string,
    error: unknown
  ): PendingGameResult[] {
    const ids = new Set(batch.map((r) => r.localId));
    const errorCode = error instanceof ApiError ? String(error.status) : 'network';
    return queue.map((item) =>
      ids.has(item.localId) && item.gameId === gameId
        ? this.markAttemptFailed(item, errorCode)
        : item
    );
  }

  private markAttemptFailed(item: PendingGameResult, errorCode: string): PendingGameResult {
    const syncAttempts = item.syncAttempts + 1;
    const backoffMs = Math.min(
      MAX_SYNC_BACKOFF_MS,
      BASE_SYNC_BACKOFF_MS * 2 ** Math.max(0, syncAttempts - 1)
    );
    const now = Date.now();

    return {
      ...item,
      syncAttempts,
      lastErrorCode: errorCode,
      lastAttemptAt: new Date(now).toISOString(),
      nextAttemptAt: new Date(now + backoffMs).toISOString(),
    };
  }
}

export const gameSync = new GameSyncService();
