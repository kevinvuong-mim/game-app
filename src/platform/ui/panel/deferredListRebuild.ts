/**
 * Coalesces rapid list rebuilds and defers tear-down while pointer is down,
 * avoiding Phaser hit-target destruction mid-tap.
 */
export class DeferredListRebuild {
  private pending = false;
  private scheduled = false;
  private locked = false;

  constructor(private readonly rebuild: () => void) {
    ensurePointerDownTracking();
  }

  /** Block rebuilds while a purchase / claim interaction is in flight. */
  setLocked(locked: boolean): void {
    this.locked = locked;
    if (!locked && this.pending) {
      this.flush();
    }
  }

  schedule(): void {
    this.pending = true;
    if (this.locked || this.scheduled) return;

    if (isPointerDown()) {
      this.scheduled = true;
      waitForPointerUp(() => {
        this.scheduled = false;
        this.flush();
      });
      return;
    }

    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      this.flush();
    });
  }

  /** Run immediately if not locked (used for first paint). */
  runNow(): void {
    if (this.locked) {
      this.pending = true;
      return;
    }
    this.pending = false;
    this.rebuild();
  }

  private flush(): void {
    if (!this.pending || this.locked) return;
    this.pending = false;
    this.rebuild();
  }
}

type PointerWindow = Window & { __gskPointerDown?: boolean };

function isPointerDown(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean((window as PointerWindow).__gskPointerDown);
}

function waitForPointerUp(cb: () => void): void {
  const onUp = () => {
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    (window as PointerWindow).__gskPointerDown = false;
    cb();
  };
  window.addEventListener('pointerup', onUp, { once: true });
  window.addEventListener('pointercancel', onUp, { once: true });
}

/** Install once — tracks global pointer-down for deferred rebuilds. */
let pointerTrackingInstalled = false;
function ensurePointerDownTracking(): void {
  if (pointerTrackingInstalled || typeof window === 'undefined') return;
  pointerTrackingInstalled = true;
  window.addEventListener(
    'pointerdown',
    () => {
      (window as PointerWindow).__gskPointerDown = true;
    },
    true
  );
  window.addEventListener(
    'pointerup',
    () => {
      (window as PointerWindow).__gskPointerDown = false;
    },
    true
  );
  window.addEventListener(
    'pointercancel',
    () => {
      (window as PointerWindow).__gskPointerDown = false;
    },
    true
  );
}
