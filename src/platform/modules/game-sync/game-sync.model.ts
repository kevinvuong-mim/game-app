/**
 * Offline game-result sync model.
 *
 * Results are queued locally and batch-uploaded to `POST /results`.
 */

export const MAX_BATCH_SIZE = 50;
export const MAX_SYNC_ATTEMPTS = 10;
export const MAX_PENDING_RESULTS = 500;
export const PENDING_RESULTS_KEY = 'game-sync:pending';

/**
 * Transient / retry-forever error codes for the offline queue.
 * These must never permanently drop a queued score (lie-fi, timeouts, 5xx).
 */
export function isTransientSyncErrorCode(code: string | undefined): boolean {
  if (!code) return false;
  if (code === 'network') return true;
  const status = Number(code);
  if (!Number.isFinite(status)) return false;
  return status === 0 || status === 408 || status === 429 || status >= 500;
}

export interface PendingGameResult {
  score: number;
  gameId: string;
  guestId: string;
  localId: string;
  synced: boolean;
  playedAt: string;
  createdAt: string;
  syncAttempts: number;
  clientResultId: string;
  lastAttemptAt?: string;
  nextAttemptAt?: string;
  lastErrorCode?: string;
  metadata?: Record<string, unknown>;
}

export interface GameResultPayload {
  score: number;
  playedAt?: string;
  clientResultId: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface GameResultBatchRequest {
  gameId: string;
  items: GameResultPayload[];
}

export interface ResultSubmitData {
  rank?: number;
  bestScore?: number;
  insertedCount: number;
}

export function toNonNegativeInt(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.floor(value);
}

/** Keep only flat primitive metadata values the API accepts. */
export function toResultMetadata(
  metadata?: Record<string, unknown>
): Record<string, string | number | boolean | null> | undefined {
  if (!metadata) return undefined;

  const result: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (value === null || typeof value === 'boolean' || typeof value === 'string') {
      result[key] = value;
      continue;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      result[key] = value;
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}
