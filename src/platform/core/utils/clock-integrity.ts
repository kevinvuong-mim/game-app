/** Shared wall-clock skew detection for daily reward + missions. */
export const BACKWARD_CLOCK_TOLERANCE_MS = 60_000;
export const FORWARD_CLOCK_TOLERANCE_MS = 60_000;

export type ClockCheckPoint = {
  wall: number;
  mono: number;
};

function readMonoNow(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : 0;
}

/**
 * Detects device clock abuse:
 * - Wall clock moved backward vs saved session/claim stamps
 * - Claim stamp lies in the future (forwarded clock then reverted)
 * - Mid-session wall clock jumped ahead/behind relative to monotonic elapsed time
 *
 * Cross-process forward farming (set clock ahead while the app is killed) cannot be
 * proven client-side without a trusted time source — sticky locks handle that residual.
 */
export function detectTimeManipulation(params: {
  now?: number;
  monoNow?: number;
  lastSessionTimestamp: number;
  lastClaimWallClock?: number;
  previousCheck?: ClockCheckPoint | null;
}): boolean {
  const now = params.now ?? Date.now();
  const monoNow = params.monoNow ?? readMonoNow();
  const { lastSessionTimestamp, lastClaimWallClock = 0, previousCheck } = params;

  if (previousCheck && monoNow > 0) {
    const wallDelta = now - previousCheck.wall;
    const monoDelta = monoNow - previousCheck.mono;
    if (wallDelta - monoDelta > FORWARD_CLOCK_TOLERANCE_MS) {
      return true;
    }
    if (monoDelta - wallDelta > BACKWARD_CLOCK_TOLERANCE_MS) {
      return true;
    }
  }

  if (lastSessionTimestamp > 0 && now < lastSessionTimestamp - BACKWARD_CLOCK_TOLERANCE_MS) {
    return true;
  }

  if (lastClaimWallClock > 0 && now < lastClaimWallClock - BACKWARD_CLOCK_TOLERANCE_MS) {
    return true;
  }

  if (lastClaimWallClock > now + BACKWARD_CLOCK_TOLERANCE_MS) {
    return true;
  }

  return false;
}

/** Tracks the last wall/mono pair so callers can detect mid-session clock jumps. */
export class ClockIntegritySession {
  private previous: ClockCheckPoint | null = null;

  check(params: {
    now?: number;
    lastSessionTimestamp: number;
    lastClaimWallClock?: number;
  }): boolean {
    const now = params.now ?? Date.now();
    const monoNow = readMonoNow();
    const manipulated = detectTimeManipulation({
      now,
      monoNow,
      lastSessionTimestamp: params.lastSessionTimestamp,
      lastClaimWallClock: params.lastClaimWallClock,
      previousCheck: this.previous,
    });
    this.previous = { wall: now, mono: monoNow };
    return manipulated;
  }
}
