# Game result sync

Offline-first queue → batch upload `POST /api/results`.

Top 100 exit push (`top_100_exited`) is **server-side**: API gửi FCM khi guest #100 bị đẩy xuống rank >100. Client chỉ submit score; không so sánh score với 100.

Chỉ **infinity mode** sync lên leaderboard (`submitScore: true`). Level/map mode emit `game:over` với `submitScore: false` — không queue.

## Storage

| Key                 | Provider                           | Nội dung                |
| ------------------- | ---------------------------------- | ----------------------- |
| `game-sync:pending` | Durable storage (`StorageService`) | Queue kết quả chưa sync |

Trên native Preferences, key được lưu với prefix `gsk:` (vật lý: `gsk:game-sync:pending`).

## Limits

Khớp `SubmitResultDto` / `@IsValidMetadata` trên game-api:

| Constant / rule           | Value                         |
| ------------------------- | ----------------------------- |
| `MAX_BATCH_SIZE`          | 50                            |
| `MAX_SYNC_ATTEMPTS`       | 10                            |
| `MAX_PENDING_RESULTS`     | 500                           |
| Score                     | Integer 0 … `2147483647`      |
| `clientResultId`          | Non-empty, max 128 chars      |
| Metadata                  | Flat object, ≤10 keys         |
| Metadata key              | 1–64 chars                    |
| Metadata string value     | Max 256 chars                 |
| Metadata JSON             | `JSON.stringify` ≤ 2048 chars |

Client clamp/sanitize trước khi gửi để tránh 400 (4xx cứng bị drop sau đủ attempt).

## Request

Headers: `X-Api-Key` + `Authorization: Bearer <secretToken>` (mọi route trừ `GET /api/health` đều cần `X-Api-Key`).

Rate limit API: 20 requests / 60 giây per guest (`429` được retry, không drop).

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

Client chỉ gửi flat primitives (`string` / finite `number` / `boolean` / `null`) từ gameplay (`duration`, `merges`, …). `toResultMetadata()` lọc cho khớp `@IsValidMetadata`.

## Flow

1. `game:over` với `submitScore: true` (infinity) → queue local (`gameSyncController`). Metadata `duration` là **giây** (`Math.round(durationMs / 1000)`), kèm optional `merges` (số match). Level/map (`submitScore: false`) không queue.
2. Rời gameplay giữa chừng **không** emit `game:over` — mid-run persist (`GameRunSave` / `game-run`). Chỉ session kết thúc thật mới emit `game:over`.
3. `flush()` khi online / `app:resume` / guest ready / controller bind / native network reconnect.
4. Batch tối đa 50 items, `X-Api-Key` + Bearer. Orphan queue items thuộc guest khác bị drop khi guest ready.
5. Đánh dấu `synced: true` khi batch HTTP thành công (kể cả server dedup — `insertedCount` có thể là 0).

Mid-run leave: [game-run.md](./game-run.md). Backend contract: [Results API](../../../game-api/documents/apis/results.md).
