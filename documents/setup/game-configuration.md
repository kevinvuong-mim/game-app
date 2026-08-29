# Game configuration

File: `src/game/config.ts`

```ts
export const gameConfig: GameConfig = {
  width: 720,
  height: 1280,
  name: 'Memora',
  version: '1.0.0',
  id: import.meta.env.VITE_GAME_ID ?? '',
};
```

Memora is a matching-card game and does **not** enable Phaser physics. `physics` is optional on `GameConfig` — clone games that need Matter can add:

```ts
physics: {
  default: 'matter',
  matter: {
    gravity: { x: 0, y: 1.4 },
    debug: false,
  },
},
```

| Field     | Nguồn          | Mô tả                                              |
| --------- | -------------- | -------------------------------------------------- |
| `id`      | `VITE_GAME_ID` | Phải khớp `GameId` enum trên `game-api`            |
| `name`    | File           | Tên hiển thị của game                              |
| `width`   | File           | Chiều rộng canvas Phaser                           |
| `height`  | File           | Chiều cao canvas Phaser                            |
| `version` | File           | Phiên bản game (semver)                            |
| `physics` | File           | Optional Phaser physics (`matter` / omit for none) |

Gameplay identity for API calls comes from `RuntimeConfig.gameId` (`VITE_GAME_ID`), not from importing `@platform/core/config` in `src/game` (ESLint blocks that). Campaign layout/timers live in `src/game/campaign/mapConfig.ts`.

> **Game mới:** không chỉ đổi env trên kit. Mỗi game mới cần **1 PR `game-api`** (`GameId` + `GAME_CONFIG` + migrate) rồi mới set `VITE_GAME_ID`. Chi tiết: [Adding a new game](../../../game-api/documents/setup/adding-new-game.md).

## Env

```bash
VITE_GAME_ID=MEMORA
```

Chạy `npm run game:verify-config` trước build production. `build:android` / `build:ios` tự gọi script này trước `npm run build`. Khi `VITE_APP_ENV=production` (hoặc `ENFORCE_RELEASE_MONETIZATION=true`), script còn enforce IAP/ads release gates + API probe — xem [environment-variables.md](./environment-variables.md).

## Bootstrap (`GameEngine`)

`src/platform/bootstrap/GameEngine.ts` là entry shell:

1. `createConfig()` / `setConfig()` / `refreshServicesFromConfig()` — `RuntimeConfig.gameId` từ `VITE_GAME_ID`
2. `iap.setEnabled(config.iapEnabled)` rồi `App.init()` (guest, save, **game-run load**, controllers, …)
3. Capacitor plugins + fonts
4. `new Phaser.Game` với scenes từ `gameScenes`, physics từ `buildPhaserPhysics()` (omit / `default: false` → không gắn physics)
5. Scale: tablet `FIT` + letterbox blur backdrop; phone `ENVELOP`
6. `backgroundColor: '#1a1a2e'`, target FPS 60

Mid-run board restore: [game-run.md](../modules/game-run.md).
