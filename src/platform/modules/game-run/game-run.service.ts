import { logger } from '@platform/core/error';
import { storage } from '@platform/core/storage';

const RUN_KEY = 'gameplay-run';

/**
 * Opaque mid-run snapshot owned by the game layer.
 * Platform only persists JSON — validation happens in `@game/gameplay/GameRunSave`.
 */
class GameRunService {
  private cache: unknown = null;
  private hydrated = false;
  private writing = false;
  private dirty = false;

  async load(): Promise<void> {
    const durable = storage.getDurableProviderType();
    this.cache = (await storage.load<unknown>(RUN_KEY, durable)) ?? null;
    this.hydrated = true;
    logger.debug('[GameRun] Loaded', { hasRun: this.cache != null });
  }

  get(): unknown {
    return this.cache;
  }

  /** Sync cache update + durable flush (coalesced). */
  set(snapshot: unknown): void {
    this.cache = snapshot;
    void this.flush();
  }

  clear(): void {
    this.cache = null;
    void this.flush();
  }

  async flush(): Promise<void> {
    if (!this.hydrated) {
      logger.warn('[GameRun] Skipping flush before load');
      return;
    }

    if (this.writing) {
      this.dirty = true;
      return;
    }

    this.writing = true;
    try {
      do {
        this.dirty = false;
        const durable = storage.getDurableProviderType();
        if (this.cache == null) {
          await storage.remove(RUN_KEY, durable);
        } else {
          await storage.save(RUN_KEY, this.cache, durable);
        }
      } while (this.dirty);
      logger.debug('[GameRun] Flushed', { hasRun: this.cache != null });
    } finally {
      this.writing = false;
    }
  }
}

export const gameRunService = new GameRunService();
