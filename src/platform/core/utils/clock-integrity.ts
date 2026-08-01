/** Shared wall-clock skew detection for daily reward + missions. */
export const BACKWARD_CLOCK_TOLERANCE_MS = 60_000;

export function detectTimeManipulation(params: {
  now?: number;
  lastSessionTimestamp: number;
  lastClaimWallClock?: number;
}): boolean {
  const now = params.now ?? Date.now();
  const { lastSessionTimestamp, lastClaimWallClock = 0 } = params;

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
