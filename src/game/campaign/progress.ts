import { campaign } from '@platform/ui';
import { MAP_COUNT, cardTextureKey, getMapDefinition, getAllMaps } from './mapConfig';

function clampStars(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(3, Math.floor(value)));
}

function getMapStars(mapId: number): number[] {
  const levelCount = getMapDefinition(mapId).levelCount;
  const saved = campaign.getStars(mapId);
  return Array.from({ length: levelCount }, (_, i) => clampStars(saved[i]));
}

export function getLevelStars(mapId: number, levelIndex: number): number {
  return getMapStars(mapId)[levelIndex] ?? 0;
}

export function getMapTotalStars(mapId: number): number {
  return getMapStars(mapId).reduce((sum, stars) => sum + stars, 0);
}

function isMapCompleted(mapId: number): boolean {
  return getMapStars(mapId).every((stars) => stars >= 1);
}

export function isMapUnlocked(mapId: number): boolean {
  if (mapId <= 1) return true;
  if (mapId > MAP_COUNT) return false;
  return isMapCompleted(mapId - 1);
}

export function isLevelPlayable(mapId: number, levelIndex: number): boolean {
  if (!isMapUnlocked(mapId)) return false;
  if (levelIndex <= 0) return true;
  return getLevelStars(mapId, levelIndex - 1) >= 1;
}

/** Infinity unlocks after beating Map 1 Level 5 (1-based). */
const INFINITY_UNLOCK_MAP_ID = 1;
const INFINITY_UNLOCK_LEVEL_INDEX = 4;

export function isInfinityUnlocked(): boolean {
  return getLevelStars(INFINITY_UNLOCK_MAP_ID, INFINITY_UNLOCK_LEVEL_INDEX) >= 1;
}

export function recordLevelStars(mapId: number, levelIndex: number, stars: number): void {
  const nextStars = clampStars(stars);
  if (nextStars <= 0) return;

  const current = getMapStars(mapId);
  if (levelIndex < 0 || levelIndex >= current.length) return;
  if (nextStars <= current[levelIndex]) return;

  current[levelIndex] = nextStars;
  campaign.setStars(mapId, current);
}

export function getUnlockedCardKeys(): string[] {
  const keys: string[] = [];
  for (const map of getAllMaps()) {
    const stars = getMapStars(map.id);
    for (let i = 0; i < stars.length; i += 1) {
      if (stars[i] >= 1) {
        keys.push(cardTextureKey(map.id, i + 1));
      }
    }
  }
  return keys;
}

export function getLastMapId(): number {
  return campaign.getLastMapId();
}

export function setLastMapId(mapId: number): void {
  campaign.setLastMapId(mapId);
}

export function getNextLevel(
  mapId: number,
  levelIndex: number
): { mapId: number; levelIndex: number } | null {
  const map = getMapDefinition(mapId);
  if (levelIndex + 1 < map.levelCount) {
    return { mapId, levelIndex: levelIndex + 1 };
  }
  if (mapId < MAP_COUNT && isMapUnlocked(mapId + 1)) {
    return { mapId: mapId + 1, levelIndex: 0 };
  }
  return null;
}
