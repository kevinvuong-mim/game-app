import { usePlatformStore } from '@platform/core/state';

/** Current personal best — game layer reads via @platform/ui. */
export function getHighScore(): number {
  return usePlatformStore.getState().progress.highScore;
}
