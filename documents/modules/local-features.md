# Local features (no game-api)

Các module dưới đây chạy **offline trên client**. Chúng không gọi `game-api` — API chỉ phục vụ guest / results / leaderboard / devices.

## Mid-run save (`game-run`)

- Durable key `gameplay-run`; schema game-owned (`GameRunSnapshot` v1 trong `src/game/gameplay/GameRunSave.ts`).
- Persist khi leave/pause mid-run; clear khi game over thật. **Không** gọi `game-api`.
- Chi tiết: [game-run.md](./game-run.md).

## Rate / share

- **rate**: in-app review + fallback store URL từ `VITE_IOS_APP_STORE_ID` / `VITE_ANDROID_PACKAGE_ID`.
- **share**: native share sheet (Game Over).

## Shop / IAP

- Catalog: `src/platform/modules/shop/catalog.json` (boosts, remove-ads IAP, coin packs). Không có skin/equip trong catalog hiện tại.
- **Boosts** (Shop scene): mua bằng coins → quantity trong inventory; gameplay skill bar đọc qua `shop` từ `@platform/ui` (`boost_hammer`, …). UI gọi `shop.purchase(itemId)` trực tiếp.
- **Remove ads** (Settings → Hide ads): IAP non-consumable qua `shop.purchase('remove_ads')` → `iap.purchase`. Bật entitlement thì `AdsService.setAdsRemoved(true)` chặn **banner, interstitial, và rewarded** (`DOUBLE_COINS`, `MISSION_WATCH`). Mission `WATCH_AD` ẩn khi ads đã gỡ (trừ lúc đang chờ claim). Client-authoritative trong starter kit (xem README IAP warning).
- **Coin pack** (Get coins modal trên CoinBar): IAP consumable `coins_10000`; fulfill coins qua `iap:purchase:success` → `shop.fulfillIapProduct`.
- Giá hiển thị: `iap.getDisplayPrice(productId, fallback)` — ưu tiên `priceString` từ store (RevenueCat/`getProducts`); fallback `COINS_10000_PRICE` (`$0.98`) / `REMOVE_ADS_PRICE` (`$3.98`) trong `iap.config.ts`. `normalizeStorePriceString` bỏ prefix kiểu `US$` → `$`.
- Already-owned / store `PRODUCT_ALREADY_PURCHASED`: grant entitlement + success (không toast lỗi). Cancel → `ShopPurchaseResult.cancelled` (UI không toast lỗi).
- Navigate/back bị chặn khi `shop.isPurchaseInFlight()` / `iap.isPurchasing()` / overlay Get-coins đang mua (`BasePanelScene`, Settings).
- Restore: Settings modal; skip consumables; `iap:restore:success` → ads sync.
- Hydrate sanitize coins/inventory từ save.

## Daily reward

- 7-day cycle; durable StorageService key `daily-reward` (`gsk:daily-reward` trên Preferences) là source of truth (không ghi vào `game-save`).
- Migrate one-shot từ legacy Preferences `daily-reward-v2` và snapshot cũ trong `game-save` nếu còn.
- UI: `DailyRewardPanel` gọi `dailyRewards.claim()` / `getRewardProgress()` trực tiếp (không có `dailyRewardController` / `*:request`).
- Claim gating: `lastClaimDate` theo lịch local (`hasClaimedToday`).
- Streak gap reset (`applyStreakGapReset`): bỏ ≥1 ngày → `currentDay = 1`. Chạy ở `init`, `app:resume`, và trước `canClaim` / `claim` / `getRewardProgress`.
- Claim day 7: cộng coin, wrap `currentDay → 1`, khóa đến ngày mai. UI cùng ngày claim vẫn hiện cả 7 ngày `claimed` (`cycleCompletedToday`).
- Event domain: `daily:claim` (analytics, notification reconcile, Home badge).

## Missions

- Definitions: `missions.json`; progress snapshot trong Zustand + `game-save`.
- **Mọi transition** (progress / complete / claim / onClaim reset) chỉ qua `MissionService` — store chỉ còn `setMissions`.
- `resetPolicy`: `'daily'` | `'never'` | `'onClaim'`.
- Progress: `missionController` lắng nghe gameplay events (`score:update` lúc abort/game-over, `merge` kể cả `count` âm khi Undo, `ad:reward` với placement `MISSION_WATCH`, …) → `MissionService`. Undo không farm MERGE / REACH_SCORE.
- Claim: UI gọi `missions.claimMission(id)` trực tiếp (không có `mission:claim:request` / `*:result`).
- Daily reset theo `lastResetDayKey` / lịch local (không có clock anti-tamper).

## Ads placements

Typed `AdPlacement` / `AdContext` trong `advertising/types.ts`:

- Banner: `HOME` / `SHOP` / `LEADERBOARD` (derive `BANNER_ALLOWED_PLACEMENTS` từ placements)
- Rewarded: `MISSION_WATCH` (mission progress only; ẩn/chặn khi remove-ads), `DOUBLE_COINS` (Game Over — nhân đôi coin của run; ads module grant + persist, không phụ thuộc scene còn sống; **không** hiện CTA khi `adsRemoved`)
- Interstitial: `GAME_OVER`
- Banner ẩn trên context `GAMEPLAY`

## List panels

Missions / Shop / Daily reward / Leaderboard dùng `DeferredListRebuild` — coalesce rebuild và defer khi pointer đang xuống (tránh destroy hit-target giữa tap).

## Settings UI

- `SettingsPanel` là composer; sections: Profile, Audio, Ads, Language, Legal (`platform/ui/settings/*`).
- Ads section: Hide-ads toggle (locked until owned), remove-ads purchase modal, restore purchases.

## EventBus contract

- **Game** emits gameplay facts (`game:start`, `score:update`, `game:over`, …).
- **UI** gọi service/method trực tiếp cho feature commands (shop / daily / mission claim) — không còn pattern `*:request` → `*:result` cho các feature này.
- **Controllers** bind lifecycle / cross-cutting: `missionController` (progress + resume resets), `bindIapController` (ads + coin fulfill), `notificationController` (resume / claim / locale).
- **Services** emit domain facts (`mission:complete`, `daily:claim`, `shop:purchase`, `iap:purchase:success`, `ad:reward`, …).

## Related

- Mid-run save: [game-run](./game-run.md)
- API-backed modules: [guest-identity](./guest-identity.md), [game-result-sync](./game-result-sync.md), [leaderboard](./leaderboard.md), [notifications](./notifications.md)
