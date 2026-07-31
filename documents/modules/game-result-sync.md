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

## HMAC signature

```text
HMAC-SHA256(
  replaySecret,
  `${gameId}|${guestId}|${clientResultId}|${score}|${playedAt || ''}`
)
```

- `playedAt`: ISO8601 string (dùng đúng chuỗi gốc khi ký).
- Field gửi lên API: `signature` (hex).

## Request

Header: `Authorization: Bearer <secretToken>`

```json
{
  "gameId": "FRULOOP",
  "items": [
    {
      "clientResultId": "result-001",
      "score": 1500,
      "playedAt": "2026-01-15T10:00:00.000Z",
      "metadata": { "duration": 12 },
      "signature": "<hmac-hex>"
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
    "rejectedCount": 0,
    "rejected": [],
    "rank": 42,
    "bestScore": 1500
  }
}
```

Khi sync thành công, `game-sync.service` emit `game:sync:completed` với `rank`/`bestScore` và cập nhật leaderboard cache.

`invalid_signature` trong `rejected[]` → **giữ tạm** + backoff (thường do sai `VITE_REPLAY_SECRET`), rồi **drop sau `MAX_SYNC_ATTEMPTS` (10)**. Reject reason khác → loại khỏi queue ngay.

Lỗi mạng thoáng qua (`status` 0 / 408 / 429 / 5xx, hoặc `network`) **không** bị drop sau `MAX_SYNC_ATTEMPTS` — queue được bảo toàn và retry với backoff. Chỉ lỗi client/server “cứng” (4xx khác) mới bị drop sau đủ attempt.

Flush **từ chối** chạy nếu `VITE_REPLAY_SECRET` không phải **64-char lowercase hex** (`/^[0-9a-f]{64}$/`) — queue được bảo toàn.

## Metadata

- Tối đa 10 keys; key dài 1–64 ký tự.
- Chỉ flat primitives (string tối đa 256 ký tự / finite number / boolean / null).
- `JSON.stringify(metadata).length` tối đa 2048 JavaScript code units. Nếu vượt giới hạn, client bỏ toàn bộ metadata trước khi gửi.

## Flow

1. `game:over` → queue local (`gameSyncController`).
2. `GameplayScene.shutdown()` cũng gọi `endSession()` → `game:over` khi navigate away giữa chừng.
3. `flush()` khi online / `app:resume` / guest ready / native network reconnect.
4. Batch tối đa 50 items, Bearer auth.
5. Đánh dấu `synced: true` khi `response.success` và item không nằm trong `rejected[]` (kể cả server dedup — `insertedCount` có thể là 0).

Backend contract đầy đủ: [Results API](../../../game-api/documents/apis/results.md).
