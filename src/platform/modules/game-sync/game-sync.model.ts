/**
 * Offline game-result sync model.
 *
 * Results are queued locally and batch-uploaded to `POST /results`.
 * Limits below match game-api `SubmitResultDto` / `@IsValidMetadata`.
 */

export const MAX_BATCH_SIZE = 50;
export const MAX_SYNC_ATTEMPTS = 10;
export const MAX_PENDING_RESULTS = 500;
export const PENDING_RESULTS_KEY = 'game-sync:pending';

/** Prisma `Int` / PostgreSQL `integer` upper bound. */
export const MAX_RESULT_SCORE = 2_147_483_647;
export const CLIENT_RESULT_ID_MAX_LENGTH = 128;

const METADATA_MAX_KEYS = 10;
const METADATA_MAX_JSON_LENGTH = 2048;
const METADATA_MAX_KEY_LENGTH = 64;
const METADATA_MAX_STRING_LENGTH = 256;

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
  return Math.min(Math.floor(value), MAX_RESULT_SCORE);
}

export function toClientResultId(value: string): string {
  return value.trim().slice(0, CLIENT_RESULT_ID_MAX_LENGTH);
}

/** Keep only flat primitive metadata values the API `@IsValidMetadata` accepts. */
export function toResultMetadata(
  metadata?: Record<string, unknown>
): Record<string, string | number | boolean | null> | undefined {
  if (!metadata) return undefined;

  const result: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (Object.keys(result).length >= METADATA_MAX_KEYS) break;
    if (key.length === 0 || key.length > METADATA_MAX_KEY_LENGTH) continue;

    if (value === null || typeof value === 'boolean') {
      result[key] = value;
      continue;
    }
    if (typeof value === 'string') {
      result[key] = value.slice(0, METADATA_MAX_STRING_LENGTH);
      continue;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      result[key] = value;
    }
  }

  while (
    Object.keys(result).length > 0 &&
    JSON.stringify(result).length > METADATA_MAX_JSON_LENGTH
  ) {
    const lastKey = Object.keys(result).at(-1);
    if (!lastKey) break;
    delete result[lastKey];
  }

  return Object.keys(result).length > 0 ? result : undefined;
}
