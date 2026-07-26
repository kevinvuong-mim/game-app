# Local features (no game-api)

Các module dưới đây chạy **offline trên client**. Chúng không gọi `game-api` — API chỉ phục vụ guest / results / leaderboard / devices.

## Shop

- Catalog: `src/platform/modules/shop/catalog.json` (boosts, remove-ads IAP, coin packs).
- **Boosts**: mua bằng coins → quantity trong inventory; dùng trong gameplay skill bar (`boost_hammer`, `boost_change`, `boost_swap`, `boost_size`, `boost_undo`).
- **Remove ads**: IAP entitlement — client-authoritative trong starter kit (xem README IAP warning).

## Daily reward

- 7-day cycle; Preferences key `daily-reward-v2`.
- Anti-tamper: `timeManipulated` chặn claim khi đồng hồ bị kéo lùi.
- **Recovery**: `init()` / `refreshSessionTimestamp()` **clear** flag khi clock lại nhất quán với `lastSessionTimestamp` / `lastClaimWallClock` (không còn khoá vĩnh viễn).

## Missions

- Definitions: `missions.json`; progress trong Zustand + `game-save`.
- `resetPolicy`: chỉ `'daily'` | `'never'` được implement.
- Demo: mission `WATCH_AD` (xem rewarded ads).

## Related

- API-backed modules: [guest-identity](./guest-identity.md), [game-result-sync](./game-result-sync.md), [leaderboard](./leaderboard.md), [notifications](./notifications.md)
