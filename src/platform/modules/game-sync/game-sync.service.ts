import {
  MAX_BATCH_SIZE,
  sanitizeMetadata,
  toNonNegativeInt,
  MAX_SYNC_ATTEMPTS,
  isValidReplaySecret,
  isTransientSyncErrorCode,
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
  private dirty = false;
  private flushPromise: Promise<number | null> | null = null;
  /** Last `data.rank` from a successful `/results` response (this process). */
  private lastApiRank: number | null = null;

  constructor(
    private readonly repository: GameSyncRepository = gameSyncRepository,
    private readonly guestService: GuestService = guest
  ) {}

  /** Clears stale rank before a new finished match is queued. */
  clearLastApiRank(): void {
    this.lastApiRank = null;
  }

  /**
   * Flush pending results and return `data.rank` from `/results` when online.
   * Returns null when offline, guest not ready, or the API omits rank.
   */
  async flushAndGetRank(): Promise<number | null> {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return null;
    }

    await this.flush();
    return this.lastApiRank;
  }

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

  async flush(): Promise<number | null> {
    if (this.flushPromise) {
      this.dirty = true;
      return this.flushPromise;
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return null;

    const gameId = getConfig().gameId;
    const guestId = this.guestService.getGuestId();
    if (!guestId || this.guestService.getStatus() !== 'ready') {
      logger.debug('[GameSync] Flush skipped — guest not ready');
      return null;
    }

    this.flushPromise = this.runFlush(gameId, guestId);
    try {
      return await this.flushPromise;
    } finally {
      this.flushPromise = null;
    }
  }

  private async runFlush(gameId: string, guestId: string): Promise<number | null> {
    do {
      this.dirty = false;
      await this.flushForGuest(gameId, guestId);
    } while (this.dirty);
    return this.lastApiRank;
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

    // Drop orphans from a previous guest on this install (e.g. leftover after a failed recovery).
    // Never rebind — that would attribute another identity's scores to the current guest.
    const orphanCount = queue.filter(
      (item) => !item.synced && item.gameId === gameId && !!item.guestId && item.guestId !== guestId
    ).length;
    if (orphanCount > 0) {
      logger.warn('[GameSync] Dropping orphaned results from previous guest', {
        count: orphanCount,
      });
      queue = queue.filter(
        (item) => item.synced || item.gameId !== gameId || !item.guestId || item.guestId === guestId
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
        (r.syncAttempts < MAX_SYNC_ATTEMPTS || isTransientSyncErrorCode(r.lastErrorCode)) &&
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
        this.applyRankFromApi(response);
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

  /** Prefer `data.rank` from `/results` — coerce number-like values from the wire. */
  private applyRankFromApi(response: ResultSubmitData): void {
    const rank = toOptionalFiniteNumber(response.rank);
    if (rank === null) return;

    this.lastApiRank = rank;

    const bestScore = toOptionalFiniteNumber(response.bestScore);
    if (bestScore !== null) {
      leaderboard.updateSelfRank(rank, bestScore);
      eventBus.emit('game:sync:completed', { rank, bestScore });
    }
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
        // Secret mismatch — count toward drop; do not retry forever.
        logger.error(
          '[GameSync] Result rejected (invalid_signature) — will drop after max attempts; check VITE_REPLAY_SECRET',
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

      // Never drop scores that failed due to transient network / server blips.
      if (item.syncAttempts >= MAX_SYNC_ATTEMPTS && !isTransientSyncErrorCode(item.lastErrorCode)) {
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
        ? this.markAttemptFailed(item, errorCode, {
            countTowardDrop: !isTransientSyncErrorCode(errorCode),
          })
        : item
    );
  }

  private markAttemptFailed(
    item: PendingGameResult,
    errorCode: string,
    options: { countTowardDrop?: boolean } = {}
  ): PendingGameResult {
    const countTowardDrop = options.countTowardDrop ?? !isTransientSyncErrorCode(errorCode);
    // Cap below MAX so transient failures stay eligible for flush forever.
    const syncAttempts = countTowardDrop
      ? item.syncAttempts + 1
      : Math.min(item.syncAttempts + 1, MAX_SYNC_ATTEMPTS - 1);
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

function toOptionalFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export const gameSync = new GameSyncService();
