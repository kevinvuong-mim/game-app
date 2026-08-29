# Leaderboard

Hybrid offline-first: đọc all-time leaderboard từ `game-api`, cache theo page (TTL 60s, `LEADERBOARD_LIMIT` = 100/page), stale-while-revalidate khi offline.

## Events / calls

Không còn event `leaderboard:refresh` / `leaderboard:page`. UI và lifecycle gọi service trực tiếp; service emit `leaderboard:update` với view model.

| Nguồn                          | Hành vi                                          |
| ------------------------------ | ------------------------------------------------ |
| `LeaderboardPanel.refresh()`   | `leaderboard.refreshLeaderboard(1)` khi mở panel |
| `app:resume` (`app-events.ts`) | `leaderboard.fetchLeaderboard({ force: false })` |
| `leaderboard:update`           | UI nhận view model sau mỗi load / cache serve    |

## Offline / fetch behavior

- `init()`: hydrate từ cache local nếu có; đánh dấu `isStale` khi cache hết TTL.
- `fetchLeaderboard()` / `refreshLeaderboard()`: **luôn** serve cache trước (SWR), rồi revalidate mạng. `force` chỉ bỏ qua TTL freshness — không bỏ qua cache.
- Cache key: `leaderboard:cache:{gameId}:{guestId|anon}:p{page}` (guest-scoped). Key cũ không có guestId bị xóa khi save cache mới.
- `updateSelfRank` (sau `POST /results`) ghi `self` xuống cache; serve cache giữ `myRank`/`myBestScore` in-memory nếu mới hơn cache (tránh SWR đè rank vừa submit).
- 401 guest recovery gọi `resetForGuestChange()` — không serve `self` của guest cũ.
- Offline (`navigator.onLine === false`): trả cache ngay; nếu không có cache → `offlineLocalBest` / error view (không chờ timeout mạng).
- In-flight reuse chỉ khi **cùng page** và `!force`. Mỗi request có `fetchSeq`; response cũ bị discard khi `seq !== fetchSeq` (tránh race khi đổi page / force refresh).
- `status`: `idle` \| `ready` \| `error` \| `loading` \| `refreshing` — **không** có `'offline'`.
- Banner UI dựa trên `isStale` + `error` i18n (`leaderboard.offlineLocalBest`, `leaderboard.error`).
- `myBestScore`: enrich từ `progress.highScore` local khi API không trả `self`.

## Endpoint

`GET /api/leaderboards?gameId=FRULOOP&page=1&limit=100&guestId=<optional>`  
Header: `X-Api-Key` (khớp `VITE_API_KEY` / game-api `API_KEY`). Rate limit API: 30 requests / 60 giây per IP.

## Response (`data`)

```json
{
  "gameId": "FRULOOP",
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
