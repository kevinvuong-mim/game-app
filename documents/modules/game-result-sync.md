# Game result sync

Offline-first queue → batch upload `POST /api/results`.

## Storage

| Key                 | Provider                           | Nội dung                |
| ------------------- | ---------------------------------- | ----------------------- |
| `game-sync:pending` | Durable storage (`StorageService`) | Queue kết quả chưa sync |

Trên native Preferences, key được lưu với prefix `gsk:` (vật lý: `gsk:game-sync:pending`).

## Limits

| Constant              | Value |
| --------------------- | ----: |
| `MAX_BATCH_SIZE`      |    50 |
| `MAX_SYNC_ATTEMPTS`   |    10 |
| `MAX_PENDING_RESULTS` |   500 |

## Request

Header: `Authorization: Bearer <secretToken>`

```json
{
  "gameId": "MEMORA",
  "items": [
    {
      "clientResultId": "result-001",
      "score": 1500,
      "playedAt": "2026-01-15T10:00:00.000Z",
      "metadata": { "duration": 12 }
    }
  ]
}
```

## Response

Backend trả REST envelope; client unwrap `.data` bằng `unwrapSuccessEnvelope()`:

```json
{
  "success": true,
  "statusCode": 201,
  "message": "Resource created successfully",
  "path": "/api/results",
  "timestamp": "2026-07-09T12:00:00.000Z",
  "data": {
    "insertedCount": 1,
    "rank": 42,
    "bestScore": 1500
  }
}
```

Khi sync thành công, `game-sync.service` emit `game:sync:completed` với `rank`/`bestScore` và cập nhật leaderboard cache.

Lỗi mạng thoáng qua (`status` 0 / 408 / 429 / 5xx, hoặc `network`) **không** bị drop sau `MAX_SYNC_ATTEMPTS` — queue được bảo toàn và retry với backoff. Chỉ lỗi client/server “cứng” (4xx khác) mới bị drop sau đủ attempt.

## Metadata

Client chỉ gửi flat primitives (`string` / finite `number` / `boolean` / `null`) từ gameplay (`duration`, `merges`, …). Server validate thêm qua `@IsValidMetadata`.

## Flow

1. `game:over` → queue local (`gameSyncController`). Metadata `duration` là **giây** (`Math.round(durationMs / 1000)`), kèm optional `merges`.
2. Rời gameplay giữa chừng **không** emit `game:over` — `GameplayScene` gọi `abortSession()` → mid-run persist (`GameRunSave` / `game-run`). Chỉ `completeSession()` (game over thật) clear mid-run save và emit `game:over`.
3. `flush()` khi online / `app:resume` / guest ready / controller bind / native network reconnect.
4. Batch tối đa 50 items, Bearer auth. Orphan queue items thuộc guest khác bị drop khi guest ready.
5. Đánh dấu `synced: true` khi batch HTTP thành công (kể cả server dedup — `insertedCount` có thể là 0).

Mid-run leave: [game-run.md](./game-run.md). Backend contract: [Results API](../../../game-api/documents/apis/results.md).
