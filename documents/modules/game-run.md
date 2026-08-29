# Mid-run save (game-run)

Opaque mid-run snapshot so leaving gameplay mid-session (back, pause, app background) can restore the board instead of forcing a new run.

Memora keeps **two independent snapshots** in one durable blob: campaign and infinity. Leaving one mode does not wipe the other.

## Ownership

| Layer    | File                                                | Role                                                                         |
| -------- | --------------------------------------------------- | ---------------------------------------------------------------------------- |
| Platform | `src/platform/modules/game-run/game-run.service.ts` | Durable store key `gameplay-run`; coalesce flush; skip flush before `load()` |
| Game     | `src/game/gameplay/GameRunSave.ts`                  | Schema `GameRunSnapshot` v2, dual store, validate, `isMeaningfulGameRun`     |
| Scene    | `src/game/scenes/GameplayScene.ts`                  | Load on create; persist on leave/pause/`shutdown`; clear on real game-over   |

ESLint blocks `@platform/modules/*` from `src/game`. Game code imports `gameRunService` via `@platform/ui` re-export.

## Storage

| Key            | Provider                           | Nội dung                                          |
| -------------- | ---------------------------------- | ------------------------------------------------- |
| `gameplay-run` | Durable storage (`StorageService`) | `{ version: 2, campaign?, infinity? }` JSON store |

Trên native Preferences, key vật lý có prefix `gsk:`. IndexedDB dùng logical key không prefix.

Corrupt / schema-drifted payloads (wrong `version`, invalid cards, `remainingMs <= 0`) are dropped so Play starts fresh.

## Snapshot schema (`version: 2`)

```ts
{
  version: 2,
  campaign?: GameRunSnapshot,   // restored only for that mapId + levelIndex
  infinity?: GameRunSnapshot,
}

// GameRunSnapshot
{
  version: 2,
  mode: 'campaign' | 'infinity',
  mapId: number,
  levelIndex: number,
  remainingMs: number,
  totalMs: number,
  score: number,
  coinsEarned: number,
  matches: number,
  combo: number,
  elapsedMs: number,
  sessionStarted: boolean,
  infinityPool: string[],
  cards: Array<{ slotIndex: number; pairKey: string }>,
  revealArmed: boolean,
  cloverArmed: boolean,
  lastMatchAt: number          // wall-clock ms of last infinity match; 0 if none
}
```

`lastMatchAt` is optional on older v2 payloads (missing → 0) so existing mid-run saves still load. Restore keeps the timestamp so a fast-match bonus is not lost after pause, and a long background still ages out of `INFINITY_FAST_MATCH_MS`.

`isMeaningfulGameRun` is false when time is already up, or a campaign board has zero live cards. Otherwise a run is meaningful when `sessionStarted`, Extra Time pushed the timer above `totalMs`, or a skill is armed (`revealArmed` / `cloverArmed`) — otherwise leave does not persist.

Campaign restore also requires the same `mapId` + `levelIndex`. Infinity restore ignores map/level.

## Lifecycle

1. **Boot:** `App.init` → `saveService.loadLocal()` then `gameRunService.load()`.
2. **Enter gameplay:** `loadGameRun(mode, mapId, levelIndex)` hydrates the board if the snapshot is valid.
3. **Leave mid-run** (back / navigate to leaderboard / `shutdown` while still live): `leaveWithoutFinishing()` → `persistRun()` / `saveGameRun` when meaningful — **does not** emit `game:over`. Match score/coins/time, mismatch combo/penalty, and boost consume are applied **before** flip/clear tweens so pause/leave cannot persist a half-turn. Lucky Clover stays armed through a miss (shop: next **correct** match); Reveal is consumed on that turn. Campaign stars use remaining time latched when the last pair is confirmed, not after the clear animation.
4. **App pause / visibility hidden:** `gameRunService.flush()` (+ `saveLocal`) from Capacitor / `app-events`. Gameplay also `persistRun()` on `app:pause`.
5. **Real game over** (timer / last pair / campaign win): `finishRun()` → `clearGameRun(mode)` + emit `game:over` (result sync picks up from there). The other mode’s snapshot is kept. Campaign last-pair clear still counts as a win if the timer hits zero during the tween.

## Related

- Result upload only on `game:over`: [game-result-sync.md](./game-result-sync.md)
- Local save (progress/coins, not mid-run board): [local-features.md](./local-features.md)
