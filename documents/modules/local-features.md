# Local features (no game-api)

Các module dưới đây chạy **offline trên client**. Chúng không gọi `game-api` — API chỉ phục vụ guest / results / leaderboard / devices.

## Shop

- Catalog: `src/platform/modules/shop/catalog.json` (boosts, remove-ads IAP, coin packs).
- **Boosts**: mua bằng coins → quantity trong inventory; gameplay skill bar đọc qua `shop` từ `@platform/ui` (`boost_hammer`, …).
- **Remove ads**: IAP entitlement — client-authoritative trong starter kit (xem README IAP warning).

## Daily reward

- 7-day cycle; **Preferences** key `daily-reward-v2` là source of truth (không ghi vào `game-save`).
- UI: EventBus `daily:progress:request` / `daily:claim:request` → `dailyRewardController`.
- Anti-tamper: `timeManipulated` chặn claim khi đồng hồ bị kéo lùi; clear khi clock nhất quán lại.

## Missions

- Definitions: `missions.json`; progress trong Zustand + `game-save`.
- `resetPolicy`: `'daily'` | `'never'` | `'onClaim'`.
- Progress: `mission.tracker` ← gameplay events (`score:update`, `ad:reward` với placement `MISSION_WATCH`, …).
- Claim: EventBus `mission:claim:request` / `mission:claim:result` → `missionController` (cùng pattern daily reward).
- Clock integrity: shared `detectTimeManipulation` — block reset/claim khi tua đồng hồ.

## Settings UI

- `SettingsPanel` là composer; sections: Profile, Audio, Ads, Language, Legal (`platform/ui/settings/*`).

## EventBus contract

- **Game** emits gameplay facts (`game:start`, `score:update`, `game:over`, …).
- **Controllers** handle UI commands (`*:request` → work → `*:result`).
- **Services** emit domain facts (`mission:complete`, `daily:claim`, `ad:reward`, …).

## Related

- API-backed modules: [guest-identity](./guest-identity.md), [game-result-sync](./game-result-sync.md), [leaderboard](./leaderboard.md), [notifications](./notifications.md)
