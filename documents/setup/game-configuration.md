# Game configuration

File: `src/game/config.ts`

```ts
export const gameConfig: GameConfig = {
  width: 720,
  height: 1280,
  version: '1.0.0',
  name: 'Fruloop',
  id: import.meta.env.VITE_GAME_ID ?? '',
  replaySecret: import.meta.env.VITE_REPLAY_SECRET ?? '',
};
```

| Field          | Nguồn                | Mô tả                                                   |
| -------------- | -------------------- | ------------------------------------------------------- |
| `id`           | `VITE_GAME_ID`       | Phải khớp `GameId` enum trên `game-api`                 |
| `replaySecret` | `VITE_REPLAY_SECRET` | Khớp `GAME_CONFIG[gameId].replaySecret` trên `game-api` |
| `name`         | File                 | Tên hiển thị của game                                   |
| `width`        | File                 | Chiều rộng canvas Phaser                                |
| `height`       | File                 | Chiều cao canvas Phaser                                 |
| `version`      | File                 | Phiên bản game (semver)                                 |

> **Game mới:** không chỉ đổi env trên kit. Mỗi game mới cần **1 PR `game-api`** (`GameId` + `GAME_CONFIG` + migrate) rồi mới set `VITE_GAME_ID` / `VITE_REPLAY_SECRET`. Chi tiết: [Adding a new game](../../../game-api/documents/setup/adding-new-game.md).

## Env

```bash
VITE_REPLAY_SECRET=<64-char-lowercase-sha256-hex>
VITE_GAME_ID=FRULOOP
```

Chạy `npm run game:verify-config` trước build production.
