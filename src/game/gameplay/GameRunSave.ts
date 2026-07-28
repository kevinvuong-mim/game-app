import { FRUIT_TYPES, SPAWN_MAX_LEVEL } from '@game/fruits';
import {
  clearPersistedGameRun,
  getPersistedGameRun,
  setPersistedGameRun,
} from '@platform/ui/gameRun';

const LEGACY_SESSION_KEY = 'gsk:gameplay-run';

export type SavedFruit = {
  x: number;
  y: number;
  level: number;
  scoreMultiplier: number;
  vx: number;
  vy: number;
  angularVelocity: number;
};

export type GameRunSnapshot = {
  version: 1;
  score: number;
  merges: number;
  elapsedMs: number;
  sessionStarted: boolean;
  currentLevel: number;
  nextLevel: number;
  dropperX: number;
  fruits: SavedFruit[];
};

let memory: GameRunSnapshot | null = null;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isValidSpawnLevel(level: unknown): level is number {
  return (
    typeof level === 'number' && Number.isInteger(level) && level >= 0 && level <= SPAWN_MAX_LEVEL
  );
}

function isValidFruitLevel(level: unknown): level is number {
  return (
    typeof level === 'number' && Number.isInteger(level) && level >= 0 && level < FRUIT_TYPES.length
  );
}

function isSavedFruit(value: unknown): value is SavedFruit {
  if (!value || typeof value !== 'object') return false;
  const fruit = value as Partial<SavedFruit>;
  return (
    isFiniteNumber(fruit.x) &&
    isFiniteNumber(fruit.y) &&
    isValidFruitLevel(fruit.level) &&
    isFiniteNumber(fruit.scoreMultiplier) &&
    fruit.scoreMultiplier > 0 &&
    isFiniteNumber(fruit.vx) &&
    isFiniteNumber(fruit.vy) &&
    isFiniteNumber(fruit.angularVelocity)
  );
}

function isGameRunSnapshot(value: unknown): value is GameRunSnapshot {
  if (!value || typeof value !== 'object') return false;
  const snap = value as Partial<GameRunSnapshot>;
  if (snap.version !== 1 || !Array.isArray(snap.fruits)) return false;
  if (!snap.fruits.every(isSavedFruit)) return false;
  if (!isFiniteNumber(snap.score) || snap.score < 0) return false;
  if (!isFiniteNumber(snap.merges) || snap.merges < 0) return false;
  if (!isFiniteNumber(snap.elapsedMs) || snap.elapsedMs < 0) return false;
  if (typeof snap.sessionStarted !== 'boolean') return false;
  if (!isValidSpawnLevel(snap.currentLevel) || !isValidSpawnLevel(snap.nextLevel)) return false;
  if (!isFiniteNumber(snap.dropperX)) return false;
  return true;
}

function readLegacySession(): GameRunSnapshot | null {
  try {
    if (typeof sessionStorage === 'undefined') return null;
    const raw = sessionStorage.getItem(LEGACY_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return isGameRunSnapshot(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function clearLegacySession(): void {
  try {
    if (typeof sessionStorage === 'undefined') return;
    sessionStorage.removeItem(LEGACY_SESSION_KEY);
  } catch {
    // ignore
  }
}

export function loadGameRunSave(): GameRunSnapshot | null {
  if (memory) return memory;

  const persisted = getPersistedGameRun();
  if (isGameRunSnapshot(persisted)) {
    memory = persisted;
    return memory;
  }

  // Corrupt / schema-drifted durable save — drop it so Play can start fresh.
  if (persisted != null) {
    clearPersistedGameRun();
  }

  // One-time migration from the old sessionStorage-only save.
  const legacy = readLegacySession();
  if (legacy) {
    memory = legacy;
    setPersistedGameRun(legacy);
    clearLegacySession();
    return memory;
  }

  clearLegacySession();
  return null;
}

export function saveGameRun(snapshot: GameRunSnapshot): void {
  memory = snapshot;
  setPersistedGameRun(snapshot);
  clearLegacySession();
}

export function clearGameRunSave(): void {
  memory = null;
  clearPersistedGameRun();
  clearLegacySession();
}

/** True when leaving would discard progress the player expects to keep. */
export function isMeaningfulRun(
  snapshot: Pick<GameRunSnapshot, 'score' | 'sessionStarted' | 'fruits'>
): boolean {
  return snapshot.sessionStarted || snapshot.score > 0 || snapshot.fruits.length > 0;
}
