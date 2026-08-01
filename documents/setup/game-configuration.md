# Game configuration

File: `src/game/config.ts`

```ts
export const gameConfig: GameConfig = {
  width: 720,
  height: 1280,
  version: '1.0.0',
  name: 'Fruloop',
  id: import.meta.env.VITE_GAME_ID ?? '',
  // Suika demo uses Matter; replace or remove when cloning a non-physics game.
  physics: {
    default: 'matter',
    matter: {
      gravity: { x: 0, y: 1.4 },
      debug: false,
    },
  },
};
```

| Field     | Nguồn          | Mô tả                                                   |
| --------- | -------------- | ------------------------------------------------------- |
| `id`      | `VITE_GAME_ID` | Phải khớp `GameId` enum trên `game-api`                 |
| `name`    | File           | Tên hiển thị của game                                   |
| `width`   | File           | Chiều rộng canvas Phaser                                |
| `height`  | File           | Chiều cao canvas Phaser                                 |
| `version` | File           | Phiên bản game (semver)                                 |
| `physics` | File           | Optional Phaser physics (`matter` / omit for none)      |

**Replay secret** không nằm trong `gameConfig`. `GameEngine` gọi `createConfig()` → `RuntimeConfig.replaySecret` từ `VITE_REPLAY_SECRET`. Game-sync / HMAC đọc `getConfig().replaySecret`. Gameplay nên emit `getConfig().gameId` (hoặc cùng `VITE_GAME_ID` qua `gameConfig.id`).

> **Game mới:** không chỉ đổi env trên kit. Mỗi game mới cần **1 PR `game-api`** (`GameId` + `GAME_CONFIG` + migrate) rồi mới set `VITE_GAME_ID` / `VITE_REPLAY_SECRET`. Chi tiết: [Adding a new game](../../../game-api/documents/setup/adding-new-game.md).

## Env

```bash
VITE_REPLAY_SECRET=<64-char-lowercase-sha256-hex>
VITE_GAME_ID=FRULOOP
```

Chạy `npm run game:verify-config` trước build production.
