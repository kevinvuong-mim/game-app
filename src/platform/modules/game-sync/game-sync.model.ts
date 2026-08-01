/**
 * Offline game-result sync model.
 *
 * Results are queued locally and batch-uploaded to `POST /results`
 * with an HMAC `signature` per item.
 */

export const PENDING_RESULTS_KEY = 'game-sync:pending';

export const MAX_BATCH_SIZE = 50;
export const MAX_SYNC_ATTEMPTS = 10;
export const MAX_PENDING_RESULTS = 500;

/**
 * Transient / retry-forever error codes for the offline queue.
 * These must never permanently drop a queued score (lie-fi, timeouts, 5xx).
 * `invalid_signature` is NOT transient — wrong secret should eventually drop.
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
  signature?: string;
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
  signature: string;
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
  rejectedCount?: number;
  rejected?: Array<{ clientResultId: string; reason: string }>;
}

function canonicalizeMetadata(metadata?: Record<string, string | number | boolean | null>): string {
  if (!metadata) return '';
  const keys = Object.keys(metadata).sort();
  if (keys.length === 0) return '';
  const sorted: Record<string, string | number | boolean | null> = {};
  for (const key of keys) {
    sorted[key] = metadata[key];
  }
  return JSON.stringify(sorted);
}

function buildReplayPayload(params: {
  score: number;
  gameId: string;
  guestId: string;
  playedAt?: string;
  clientResultId: string;
  metadata?: Record<string, string | number | boolean | null>;
}): string {
  const metadataPart = canonicalizeMetadata(params.metadata);
  return `${params.gameId}|${params.guestId}|${params.clientResultId}|${params.score}|${params.playedAt ?? ''}|${metadataPart}`;
}

/**
 * HMAC-SHA256(replaySecret, payload) as lowercase hex.
 * Payload must match game-api exactly.
 */
export async function computeReplaySignature(params: {
  score: number;
  gameId: string;
  guestId: string;
  playedAt?: string;
  replaySecret: string;
  clientResultId: string;
  metadata?: Record<string, string | number | boolean | null>;
}): Promise<string> {
  const payload = buildReplayPayload(params);
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(params.replaySecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));

  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function toNonNegativeInt(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.floor(value);
}

/** Must match game-api: 64-char lowercase hex SHA-256 secret. */
export function isValidReplaySecret(secret: string): boolean {
  return /^[0-9a-f]{64}$/.test(secret);
}

const METADATA_MAX_KEYS = 10;
const METADATA_MAX_BYTES = 2048;
const METADATA_MAX_KEY_LENGTH = 64;
const METADATA_MAX_STRING_LENGTH = 256;

export function sanitizeMetadata(
  metadata?: Record<string, unknown>
): Record<string, string | number | boolean | null> | undefined {
  const result: Record<string, string | number | boolean | null> = {};
  const keys = Object.keys(metadata ?? {}).slice(0, METADATA_MAX_KEYS);

  for (const key of keys) {
    if (key.length === 0 || key.length > METADATA_MAX_KEY_LENGTH) continue;

    const value = metadata?.[key];
    if (value === null) {
      result[key] = null;
      continue;
    }
    if (typeof value === 'boolean') {
      result[key] = value;
      continue;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      result[key] = value;
      continue;
    }
    if (typeof value === 'string' && value.length <= METADATA_MAX_STRING_LENGTH) {
      result[key] = value;
    }
  }

  if (Object.keys(result).length === 0) return undefined;
  if (JSON.stringify(result).length > METADATA_MAX_BYTES) return undefined;
  return result;
}
