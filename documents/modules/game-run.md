# Mid-run save (game-run)

Opaque mid-run snapshot so leaving gameplay mid-session (back, pause, app background) can restore the board instead of forcing a new run.

## Ownership

| Layer    | File                                                | Role                                                                         |
| -------- | --------------------------------------------------- | ---------------------------------------------------------------------------- |
| Platform | `src/platform/modules/game-run/game-run.service.ts` | Durable store key `gameplay-run`; coalesce flush; skip flush before `load()` |
| Game     | `src/game/gameplay/GameRunSave.ts`                  | Schema `GameRunSnapshot` v1, validate, `isMeaningfulRun`                     |
| Scene    | `src/game/scenes/GameplayScene.ts`                  | Load on create; persist on abort/leave; clear on real game-over              |

ESLint blocks `@platform/modules/*` from `src/game`. Game code imports `gameRunService` via `@platform/ui` re-export.

## Storage

| Key            | Provider                           | Nội dung                        |
| -------------- | ---------------------------------- | ------------------------------- |
| `gameplay-run` | Durable storage (`StorageService`) | Opaque JSON (`GameRunSnapshot`) |

Trên native Preferences, key vật lý có prefix `gsk:`. IndexedDB dùng logical key không prefix.

## Snapshot schema (`version: 1`)

```ts
{
  version: 1,
  score: number,
  merges: number,
  dropperX: number,
  elapsedMs: number,
  nextLevel: number,
  currentLevel: number,
  fruits: Array<{
    x, y, vx, vy, level, scoreMultiplier, angularVelocity
  }>,
  sessionStarted: boolean
}
```

Corrupt / schema-drifted payloads are cleared so Play starts fresh.

`isMeaningfulRun` is true when `sessionStarted`, `score > 0`, or there is at least one fruit — otherwise leave does not persist.

## Lifecycle

1. **Boot:** `App.init` → `saveService.loadLocal()` then `gameRunService.load()`.
2. **Enter gameplay:** `loadGameRunSave()` hydrates board if snapshot valid.
3. **Leave mid-run** (back / navigate away / `shutdown`): `abortSession()` → `persistRun()` / `saveGameRun` when meaningful — **does not** emit `game:over`.
4. **App pause / visibility hidden:** `gameRunService.flush()` (+ `saveLocal`) from Capacitor / `app-events`.
5. **Real game over:** `completeSession()` → `clearGameRunSave()` + emit `game:over` (result sync picks up from there).

## Related

- Result upload only on `game:over`: [game-result-sync.md](./game-result-sync.md)
- Local save (progress/coins, not mid-run board): [local-features.md](./local-features.md)
