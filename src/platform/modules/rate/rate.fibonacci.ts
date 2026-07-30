/** True when `n` is a positive Fibonacci number (1, 1, 2, 3, 5, 8, …). */
function isFibonacci(n: number): boolean {
  if (!Number.isInteger(n) || n < 1) {
    return false;
  }

  let a = 1;
  let b = 1;
  while (b < n) {
    const next = a + b;
    a = b;
    b = next;
  }

  return a === n || b === n;
}

/**
 * Prompt milestones: Fibonacci × 10 → 10, 20, 30, 50, 80, 130, …
 * (game count after `game:start` increments `totalGamesPlayed`).
 */
export function isRatePromptGamesPlayed(gamesPlayed: number): boolean {
  return gamesPlayed > 0 && gamesPlayed % 10 === 0 && isFibonacci(gamesPlayed / 10);
}
