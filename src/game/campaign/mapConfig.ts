/** Card counts per map (`o-1` …) — excludes background `o-0`. */
export const MAP_CARD_COUNTS = [12, 14, 18, 16, 12, 13, 14, 12, 14, 16] as const;

export const MAP_COUNT = MAP_CARD_COUNTS.length;

/**
 * Cell counts by level index (0-based). Even numbers only.
 * Pairs never exceed the number of cards unlocked on that map so far
 * (`levelIndex + 1`), so a level never needs duplicate pair types.
 */
export const LEVEL_CELL_COUNTS = [
  2, 4, 6, 8, 8, 12, 12, 16, 16, 16, 16, 18, 18, 18, 18, 18, 18, 18,
] as const;

/** Base timer (seconds) by level index, before map difficulty offset. */
export const LEVEL_TIME_SECONDS = [
  40, 45, 50, 50, 55, 55, 65, 60, 55, 70, 65, 75, 70, 65, 80, 75, 70, 80,
] as const;

export const MIN_LEVEL_TIME_SECONDS = 20;
export const TIME_PENALTY_PER_MAP = 3;

export const STAR_THRESHOLDS = {
  three: 0.5,
  two: 0.25,
} as const;

export const INFINITY_INITIAL_TIME = 60;
export const INFINITY_MATCH_BONUS_START = 5;
export const INFINITY_MATCH_BONUS_MIN = 3;
/** 3×4 = 12 cards / 6 pairs. */
export const INFINITY_BOARD_SIZE = 12;
export const INFINITY_WAVE_MATCHES = 8;
export const INFINITY_COINS_PER_MATCH = 10;
export const INFINITY_BASE_PAIR_SCORE = 100;
export const INFINITY_COMBO_SCORE_STEP = 0.25;
export const INFINITY_FAST_MATCH_MS = 3000;
export const INFINITY_FAST_MATCH_BONUS = 25;
export const INFINITY_MISMATCH_PENALTY_FROM_WAVE = 2;
export const INFINITY_MISMATCH_PENALTY_SECONDS = 2;
export const EXTRA_TIME_SECONDS = 30;

export const FLIP_BACK_DELAY_MS = 700;
export const MATCH_CLEAR_DELAY_MS = 280;
export const INFINITY_RESPAWN_DELAY_MS = 320;

export interface MapDefinition {
  id: number;
  levelCount: number;
  nameKey: string;
  bannerName: string;
}

export function getMapDefinition(mapId: number): MapDefinition {
  const index = mapId - 1;
  const levelCount = MAP_CARD_COUNTS[index];
  if (!levelCount) {
    throw new Error(`Unknown map id: ${mapId}`);
  }
  return {
    id: mapId,
    levelCount,
    nameKey: `map.name`,
    bannerName: `Map ${mapId}`,
  };
}

export function getAllMaps(): MapDefinition[] {
  return MAP_CARD_COUNTS.map((_, i) => getMapDefinition(i + 1));
}

export function getLevelCellCount(levelIndex: number): number {
  const fallback = LEVEL_CELL_COUNTS[LEVEL_CELL_COUNTS.length - 1];
  return LEVEL_CELL_COUNTS[levelIndex] ?? fallback;
}

export function getLevelTimeSeconds(mapId: number, levelIndex: number): number {
  const fallback = LEVEL_TIME_SECONDS[LEVEL_TIME_SECONDS.length - 1];
  const base = LEVEL_TIME_SECONDS[levelIndex] ?? fallback;
  return Math.max(MIN_LEVEL_TIME_SECONDS, base - (mapId - 1) * TIME_PENALTY_PER_MAP);
}

export function getLevelPairCount(levelIndex: number): number {
  return getLevelCellCount(levelIndex) / 2;
}

export function starsFromTimeRatio(remainingRatio: number): number {
  if (remainingRatio >= STAR_THRESHOLDS.three) return 3;
  if (remainingRatio >= STAR_THRESHOLDS.two) return 2;
  return 1;
}

export function mapBackgroundKey(mapId: number): string {
  return `map-${mapId}-o-0`;
}

export function mapBackgroundPath(mapId: number): string {
  return `/assets/images/map-${mapId}/map-${mapId}-o-0.png`;
}

export function cardTextureKey(mapId: number, objectIndex: number): string {
  return `map-${mapId}-o-${objectIndex}`;
}

export function cardTexturePath(mapId: number, objectIndex: number): string {
  return `/assets/images/map-${mapId}/map-${mapId}-o-${objectIndex}.png`;
}

export interface GridSize {
  cols: number;
  rows: number;
}

export const INFINITY_GRID: GridSize = { cols: 3, rows: 4 };

const GRID_BY_CELLS: Record<number, GridSize> = {
  2: { cols: 2, rows: 1 },
  4: { cols: 2, rows: 2 },
  6: { cols: 3, rows: 2 },
  8: { cols: 3, rows: 3 },
  12: { cols: 3, rows: 4 },
  16: { cols: 3, rows: 6 },
  18: { cols: 3, rows: 6 },
  24: { cols: 3, rows: 8 },
};

export function gridForCellCount(cellCount: number): GridSize {
  return GRID_BY_CELLS[cellCount] ?? { cols: 3, rows: Math.ceil(cellCount / 3) };
}

/** Newest card is always included; fill the rest from newer → older. */
export function pickCampaignCardKeys(
  mapId: number,
  levelIndex: number,
  pairCount: number
): string[] {
  const available = levelIndex + 1;
  const keys: string[] = [];
  for (let objectIndex = available; objectIndex >= 1 && keys.length < pairCount; objectIndex -= 1) {
    keys.push(cardTextureKey(mapId, objectIndex));
  }
  while (keys.length < pairCount) {
    keys.push(cardTextureKey(mapId, available));
  }
  return keys;
}

export function infinityMatchBonusSeconds(wave: number): number {
  return Math.max(INFINITY_MATCH_BONUS_MIN, INFINITY_MATCH_BONUS_START - wave);
}

export function infinityPairScore(combo: number): number {
  return Math.round(INFINITY_BASE_PAIR_SCORE * (1 + combo * INFINITY_COMBO_SCORE_STEP));
}

export function infinityWave(matches: number): number {
  return Math.floor(Math.max(0, matches) / INFINITY_WAVE_MATCHES);
}
