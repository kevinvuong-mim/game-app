import type { IEventBus, EventHandler, PlatformEvent, PlatformEventMap } from './types';

type ListenerEntry = {
  handler: EventHandler<PlatformEvent>;
};

/**
 * Typed event bus for decoupled communication between game and platform layers.
 */
class EventBus implements IEventBus {
  private listeners = new Map<PlatformEvent, Set<ListenerEntry>>();

  /**
   * Fire-and-forget: sync handlers run immediately; async handlers run in background.
   */
  emit<T extends PlatformEvent>(event: T, payload: PlatformEventMap[T]): void {
    const entries = this.listeners.get(event);
    if (!entries?.size) return;

    for (const entry of entries) {
      try {
        const result = entry.handler(payload as PlatformEventMap[PlatformEvent]);
        if (result instanceof Promise) {
          void result.catch((error) => {
            console.error(`[EventBus] Handler error for "${event}":`, error);
          });
        }
      } catch (error) {
        console.error(`[EventBus] Handler error for "${event}":`, error);
      }
    }
  }

  on<T extends PlatformEvent>(event: T, handler: EventHandler<T>): () => void {
    return this.addListener(event, handler as EventHandler<PlatformEvent>);
  }

  private addListener(event: PlatformEvent, handler: EventHandler<PlatformEvent>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }

    const entry: ListenerEntry = { handler };
    this.listeners.get(event)!.add(entry);

    return () => {
      this.listeners.get(event)?.delete(entry);
    };
  }
}

/** Singleton platform event bus */
export const eventBus = new EventBus();
