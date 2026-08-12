import { logger } from '@platform/core/error';
import { storage } from '@platform/core/storage';

const RUN_KEY = 'gameplay-run';

/**
 * Opaque mid-run snapshot owned by the game layer.
 * Platform only persists JSON — the game layer validates snapshots if it uses mid-run saves.
 */
class GameRunService {
  private dirty = false;
  private hydrated = false;
  private cache: unknown = null;
  /** Coalesce concurrent flushes; every `await flush()` waits until durable write finishes. */
  private writeChain: Promise<void> = Promise.resolve();

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

    this.dirty = true;
    this.writeChain = this.writeChain.then(() => this.flushDirty());
    await this.writeChain;
  }

  private async flushDirty(): Promise<void> {
    while (this.dirty) {
      this.dirty = false;
      const durable = storage.getDurableProviderType();
      if (this.cache == null) {
        await storage.remove(RUN_KEY, durable);
      } else {
        await storage.save(RUN_KEY, this.cache, durable);
      }
      logger.debug('[GameRun] Flushed', { hasRun: this.cache != null });
    }
  }
}

export const gameRunService = new GameRunService();
