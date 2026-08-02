# Local features (no game-api)

Các module dưới đây chạy **offline trên client**. Chúng không gọi `game-api` — API chỉ phục vụ guest / results / leaderboard / devices.

## Mid-run save (`game-run`)

- Durable key `gameplay-run`; schema game-owned (`GameRunSnapshot` v1 trong `src/game/gameplay/GameRunSave.ts`).
- Persist khi leave/pause mid-run; clear khi game over thật. **Không** gọi `game-api`.
- Chi tiết: [game-run.md](./game-run.md).

## Rate / share

- **rate**: in-app review + fallback store URL từ `VITE_IOS_APP_STORE_ID` / `VITE_ANDROID_PACKAGE_ID`.
- **share**: native share sheet (Game Over).

## Shop

- Catalog: `src/platform/modules/shop/catalog.json` (boosts, remove-ads IAP, coin packs). Không có skin/equip trong catalog hiện tại.
- **Boosts**: mua bằng coins → quantity trong inventory; gameplay skill bar đọc qua `shop` từ `@platform/ui` (`boost_hammer`, …).
- **Remove ads**: IAP entitlement — client-authoritative trong starter kit (xem README IAP warning).
- UI: EventBus `shop:purchase:request` / `shop:purchase:result` → `shopController` (cùng pattern daily/missions); nút mua disable + loading khi locked.
- Hydrate sanitize coins/inventory từ save.

## Daily reward

- 7-day cycle; durable StorageService key `daily-reward` (`gsk:daily-reward` trên Preferences) là source of truth (không ghi vào `game-save`).
- Migrate one-shot từ legacy Preferences `daily-reward-v2` và snapshot cũ trong `game-save` nếu còn.
- UI: EventBus `daily:progress:request` / `daily:claim:request` → `dailyRewardController`.
- Claim gating: `lastClaimDate` theo lịch local (`hasClaimedToday`); streak gap reset khi bỏ ngày.

## Missions

- Definitions: `missions.json`; progress snapshot trong Zustand + `game-save`.
- **Mọi transition** (progress / complete / claim / onClaim reset) chỉ qua `MissionService` — store chỉ còn `setMissions`.
- `resetPolicy`: `'daily'` | `'never'` | `'onClaim'`.
- Progress: `mission.tracker` ← gameplay events (`score:update`, `ad:reward` với placement `MISSION_WATCH`, …).
- Claim: EventBus `mission:claim:request` / `mission:claim:result` → `missionController`.
- Daily reset theo `lastResetDayKey` / lịch local (không có clock anti-tamper).

## Ads placements

Typed `AdPlacement` / `AdContext` trong `advertising/types.ts`:

- Banner: `HOME` / `SHOP` / `LEADERBOARD` (derive `BANNER_ALLOWED_PLACEMENTS` từ placements)
- Rewarded: `MISSION_WATCH` (mission progress only)
- Interstitial: `GAME_OVER`
- Banner ẩn trên context `GAMEPLAY`

## List panels

Missions / Shop / Daily reward / Leaderboard dùng `DeferredListRebuild` — coalesce rebuild và defer khi pointer đang xuống (tránh destroy hit-target giữa tap).

## Settings UI

- `SettingsPanel` là composer; sections: Profile, Audio, Ads, Language, Legal (`platform/ui/settings/*`).

## EventBus contract

- **Game** emits gameplay facts (`game:start`, `score:update`, `game:over`, …).
- **Controllers** handle UI commands (`*:request` → work → `*:result`) — daily, missions, shop, ads, …
- **Services** emit domain facts (`mission:complete`, `daily:claim`, `shop:purchase`, `ad:reward`, …).

## Related

- Mid-run save: [game-run](./game-run.md)
- API-backed modules: [guest-identity](./guest-identity.md), [game-result-sync](./game-result-sync.md), [leaderboard](./leaderboard.md), [notifications](./notifications.md)
