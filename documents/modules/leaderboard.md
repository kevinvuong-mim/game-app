# Leaderboard

Hybrid offline-first: đọc all-time leaderboard từ `game-api`, cache theo page (TTL 60s, `LEADERBOARD_LIMIT` = 100/page), stale-while-revalidate khi offline.

Không có `LeaderboardController`. UI và bootstrap gọi `leaderboard` service trực tiếp; service emit `leaderboard:update` khi view đổi.

## Load path

| Caller                         | Method                                      | Khi nào                                              |
| ------------------------------ | ------------------------------------------- | ---------------------------------------------------- |
| `LeaderboardPanel` (mở panel)  | `leaderboard.refreshLeaderboard(1)`         | Force network (vẫn SWR: serve cache trước)           |
| `bindAppEvents` (`app:resume`) | `leaderboard.fetchLeaderboard({ force: false })` | Revalidate nếu cache hết TTL                    |
| `game-sync` (sync thành công)  | `leaderboard.updateSelfRank(rank, bestScore)` | Cập nhật footer rank/best từ `POST /results`     |

Event bus chỉ có **`leaderboard:update`** (view model). Không còn `leaderboard:refresh` / `leaderboard:page`.

## Offline / fetch behavior

- `init()`: hydrate từ cache local nếu có; đánh dấu `isStale` khi cache hết TTL.
- `fetchLeaderboard()` / `refreshLeaderboard()`: **luôn** serve cache trước (SWR), rồi revalidate mạng. `force` (`refreshLeaderboard`) chỉ bỏ qua TTL freshness — không bỏ qua cache.
- Offline (`navigator.onLine === false`): trả cache ngay; nếu không có cache → `offlineLocalBest` / error view (không chờ timeout mạng).
- In-flight reuse chỉ khi **cùng page** và `!force`. Mỗi request có `fetchSeq`; response cũ bị discard khi `seq !== fetchSeq` (tránh race khi đổi page / force refresh). Guest 401 recovery bump `fetchEpoch` + xóa cache page hiện tại — response/cache của guest cũ không apply sang identity mới.
- `status`: `idle` \| `ready` \| `error` \| `loading` \| `refreshing` — **không** có `'offline'`.
- Banner UI dựa trên `isStale` + `error` i18n (`leaderboard.offlineLocalBest`, `leaderboard.error`).
- `myBestScore`: enrich từ `progress.highScore` local khi API không trả `self` (kể cả network success). Footer "Your Rank" ưu tiên `myRank` / `myBestScore` (kể cả sau `updateSelfRank`) hơn dòng Top 100 có thể stale.

## Endpoint

`GET /api/leaderboards?gameId=MEMORA&page=1&limit=100&guestId=<optional>`  
Header: `X-Api-Key` (khớp `VITE_API_KEY` / game-api `API_KEY`). Rate limit API: 30 requests / 60 giây per IP.

## Response (`data`)

```json
{
  "gameId": "MEMORA",
  "total": 150,
  "page": 1,
  "limit": 100,
  "items": [{ "rank": 1, "guestId": "uuid", "name": "PlayerOne", "bestScore": 9999 }],
  "self": { "rank": 12, "bestScore": 5000 }
}
```

## View model

UI nhận `leaderboard:update` với `entries[].bestScore`, `myRank`, `myBestScore`, `isStale`, `fromCache`, `status`, `error`. Panel hiển thị Top 100 trong một lần request (scroll), kèm footer "Your Rank".

Backend contract đầy đủ: [Leaderboard API](../../../game-api/documents/apis/leaderboard.md). Backend mặc định 20 entries/page (max 100); starter kit luôn gửi client limit 100.
