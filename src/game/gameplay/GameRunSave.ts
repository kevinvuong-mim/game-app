import { gameRunService } from '@platform/ui';

export type SavedFruit = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  level: number;
  angularVelocity: number;
};

export type GameRunSnapshot = {
  version: 1;
  score: number;
  merges: number;
  dropperX: number;
  elapsedMs: number;
  nextLevel: number;
  fruits: SavedFruit[];
  currentLevel: number;
  sessionStarted: boolean;
};

let memory: GameRunSnapshot | null = null;

function isGameRunSnapshot(value: unknown): value is GameRunSnapshot {
  if (!value || typeof value !== 'object') return false;
  const snap = value as Partial<GameRunSnapshot>;
  return snap.version === 1 && Array.isArray(snap.fruits);
}

export function loadGameRunSave(): GameRunSnapshot | null {
  if (memory) return memory;

  const persisted = gameRunService.get();
  if (isGameRunSnapshot(persisted)) {
    memory = persisted;
    return memory;
  }

  // Corrupt / schema-drifted durable save — drop it so Play can start fresh.
  if (persisted != null) {
    gameRunService.clear();
  }

  return null;
}

export function saveGameRun(snapshot: GameRunSnapshot): void {
  memory = snapshot;
  gameRunService.set(snapshot);
}

export function clearGameRunSave(): void {
  memory = null;
  gameRunService.clear();
}

/** True when leaving would discard progress the player expects to keep. */
export function isMeaningfulRun(
  snapshot: Pick<GameRunSnapshot, 'score' | 'sessionStarted' | 'fruits'>
): boolean {
  return snapshot.sessionStarted || snapshot.score > 0 || snapshot.fruits.length > 0;
}
