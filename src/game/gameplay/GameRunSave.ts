import { gameRunService } from '@platform/ui';
import type { GameplayMode } from './GameplayHUD';

export const GAME_RUN_VERSION = 2;

export interface GameRunCardSnapshot {
  slotIndex: number;
  pairKey: string;
}

export interface GameRunSnapshot {
  version: typeof GAME_RUN_VERSION;
  mode: GameplayMode;
  mapId: number;
  levelIndex: number;
  remainingMs: number;
  totalMs: number;
  score: number;
  coinsEarned: number;
  matches: number;
  combo: number;
  elapsedMs: number;
  sessionStarted: boolean;
  infinityPool: string[];
  cards: GameRunCardSnapshot[];
  revealArmed: boolean;
  cloverArmed: boolean;
}

interface GameRunStore {
  version: typeof GAME_RUN_VERSION;
  campaign?: GameRunSnapshot;
  infinity?: GameRunSnapshot;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function parseCard(value: unknown): GameRunCardSnapshot | null {
  if (!isObject(value)) return null;
  if (!isFiniteNumber(value.slotIndex) || value.slotIndex < 0) return null;
  if (!isNonEmptyString(value.pairKey)) return null;
  return { slotIndex: Math.floor(value.slotIndex), pairKey: value.pairKey };
}

function parseSnapshot(value: unknown, mode: GameplayMode): GameRunSnapshot | undefined {
  if (!isObject(value) || value.version !== GAME_RUN_VERSION) return undefined;
  if (value.mode !== mode) return undefined;
  if (!isFiniteNumber(value.mapId) || !isFiniteNumber(value.levelIndex)) return undefined;
  if (!isFiniteNumber(value.remainingMs) || !isFiniteNumber(value.totalMs)) return undefined;
  if (!isFiniteNumber(value.score) || !isFiniteNumber(value.coinsEarned)) return undefined;
  if (!isFiniteNumber(value.matches) || !isFiniteNumber(value.combo)) return undefined;
  if (!isFiniteNumber(value.elapsedMs) || value.elapsedMs < 0) return undefined;
  if (typeof value.sessionStarted !== 'boolean') return undefined;
  if (typeof value.revealArmed !== 'boolean' || typeof value.cloverArmed !== 'boolean') {
    return undefined;
  }
  if (!Array.isArray(value.infinityPool) || !value.infinityPool.every(isNonEmptyString)) {
    return undefined;
  }
  if (!Array.isArray(value.cards)) return undefined;

  const cards: GameRunCardSnapshot[] = [];
  for (const item of value.cards) {
    const card = parseCard(item);
    if (!card) return undefined;
    cards.push(card);
  }
  if (cards.length % 2 !== 0) return undefined;
  if (value.remainingMs <= 0) return undefined;

  return {
    version: GAME_RUN_VERSION,
    mode,
    mapId: Math.floor(value.mapId),
    levelIndex: Math.floor(value.levelIndex),
    remainingMs: value.remainingMs,
    totalMs: value.totalMs,
    score: value.score,
    coinsEarned: value.coinsEarned,
    matches: Math.max(0, Math.floor(value.matches)),
    combo: Math.max(0, Math.floor(value.combo)),
    elapsedMs: value.elapsedMs,
    sessionStarted: value.sessionStarted,
    infinityPool: [...value.infinityPool],
    cards,
    revealArmed: value.revealArmed,
    cloverArmed: value.cloverArmed,
  };
}

function parseStore(raw: unknown): GameRunStore {
  if (!isObject(raw) || raw.version !== GAME_RUN_VERSION) {
    return { version: GAME_RUN_VERSION };
  }
  return {
    version: GAME_RUN_VERSION,
    campaign: parseSnapshot(raw.campaign, 'campaign'),
    infinity: parseSnapshot(raw.infinity, 'infinity'),
  };
}

export function isMeaningfulGameRun(snapshot: GameRunSnapshot): boolean {
  if (snapshot.remainingMs <= 0) return false;
  if (snapshot.mode === 'campaign' && snapshot.cards.length === 0) return false;
  return (
    snapshot.sessionStarted ||
    snapshot.remainingMs > snapshot.totalMs ||
    snapshot.revealArmed ||
    snapshot.cloverArmed
  );
}

export function loadGameRun(
  mode: GameplayMode,
  mapId: number,
  levelIndex: number
): GameRunSnapshot | null {
  const store = parseStore(gameRunService.get());
  const snapshot = mode === 'infinity' ? store.infinity : store.campaign;
  if (!snapshot || !isMeaningfulGameRun(snapshot)) return null;
  if (snapshot.mode !== mode) return null;
  if (mode === 'campaign' && (snapshot.mapId !== mapId || snapshot.levelIndex !== levelIndex)) {
    return null;
  }
  return snapshot;
}

export function saveGameRun(snapshot: GameRunSnapshot): void {
  if (!isMeaningfulGameRun(snapshot)) return;
  const store = parseStore(gameRunService.get());
  if (snapshot.mode === 'infinity') store.infinity = snapshot;
  else store.campaign = snapshot;
  gameRunService.set(store);
}

export function clearGameRun(mode: GameplayMode): void {
  const store = parseStore(gameRunService.get());
  if (mode === 'infinity') delete store.infinity;
  else delete store.campaign;
  if (!store.campaign && !store.infinity) {
    gameRunService.clear();
    return;
  }
  gameRunService.set(store);
}
