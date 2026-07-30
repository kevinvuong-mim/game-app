import { gameRunService } from '@platform/modules/game-run';

/** Sync read of the cached mid-run save (hydrated during app.init). */
export function getPersistedGameRun(): unknown {
  return gameRunService.get();
}

export function setPersistedGameRun(snapshot: unknown): void {
  gameRunService.set(snapshot);
}

export function clearPersistedGameRun(): void {
  gameRunService.clear();
}
