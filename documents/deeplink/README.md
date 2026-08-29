# Deeplink setup

Dev là subdomain của prod, nên **một bộ file** dùng chung — chỉ khác domain host.

| File (trong repo)            | Host trên mỗi domain                                      |
| ---------------------------- | --------------------------------------------------------- |
| `apple-app-site-association` | `https://<domain>/.well-known/apple-app-site-association` |
| `assetlinks.json`            | `https://<domain>/.well-known/assetlinks.json`            |

| Environment | Domain                   |
| ----------- | ------------------------ |
| Dev         | `dev-memora.vraxion.com` |
| Prod        | `memora.vraxion.com`     |

Upload **cùng nội dung** lên `.well-known/` của từng domain (HTTPS, không redirect).

## Config (không qua `.env`)

Sửa scheme + hosts tại:

| File                                                 | Dùng cho                                                   |
| ---------------------------------------------------- | ---------------------------------------------------------- |
| `src/platform/modules/deep-link/deep-link.config.ts` | Runtime (parser / `allowedHosts`)                          |
| `scripts/deeplink-config.mjs`                        | Native apply (`apply-ios-native` / `apply-android-native`) |

Hai file phải khớp nhau. Host active theo `VITE_APP_ENV` (`production` → prod, còn lại → development).

## iOS (Universal Links)

1. Replace `TEAM_ID` trong `apple-app-site-association` bằng Apple Team ID thật trước khi publish.
2. `appIDs` phải khớp Capacitor `appId` (`com.vraxion.memora`) — dạng `TEAM_ID.com.vraxion.memora`.
3. Publish file giống nhau tại:
   - `https://dev-memora.vraxion.com/.well-known/apple-app-site-association`
   - `https://memora.vraxion.com/.well-known/apple-app-site-association`
4. Content-Type: `application/json` (không có extension `.json` trong URL).
5. Associated Domains entitlement được apply bởi `scripts/apply-ios-native.mjs` (cả hai host) — luôn chạy, không phụ thuộc push; khi push tắt script strip `aps-environment`. Khi `VITE_APP_ENV=production` và push bật, script set `aps-environment` = `production`.

## Android (App Links)

1. Replace `sha256_cert_fingerprints` bằng SHA-256 của keystore (release và/hoặc debug nếu cần test).
2. `package_name` phải khớp Capacitor `appId`: `com.vraxion.memora`.
3. Publish file giống nhau tại:
   - `https://dev-memora.vraxion.com/.well-known/assetlinks.json`
   - `https://memora.vraxion.com/.well-known/assetlinks.json`
4. Intent filters (cả hai host) được inject bởi `scripts/apply-android-native.mjs`.

## Custom URL Scheme

Default scheme: `memora://`

Supported paths (`src/platform/modules/deep-link/deep-link.model.ts`):

| Path                          | Scene         |
| ----------------------------- | ------------- |
| `/`, `/home`                  | `Home`        |
| `/shop`                       | `Shop`        |
| `/legal`                      | `Legal`       |
| `/play`, `/map`               | `Map`         |
| `/gameplay`                   | `Gameplay`    |
| `/infinity`                   | `Gameplay` (`mode: 'infinity'`) |
| `/missions`                   | `Missions`    |
| `/settings`                   | `Settings`    |
| `/leaderboard`                | `Leaderboard` |
| `/daily-reward`               | `DailyReward` |
| `/how-to-play`                | `HowToPlay`   |

Examples:

- `memora://leaderboard`
- `memora://infinity`
- `https://dev-memora.vraxion.com/shop`
- `https://memora.vraxion.com/map`

## App flow

```
Deeplink URL
  → Capacitor App plugin (AppBridge)
  → DeepLinkService (pendingDeepLink on cold start)
  → EventBus (deeplink:open)
  → navigationService.navigateToScene()
  → Phaser Scene
```

Cold start: `getLaunchUrl()` chạy trước Phaser boot; destination defer qua `navigationService` pending tới `PreloadScene` (`consumePendingNavigation` rồi `scene.start`). `appUrlOpen` với cùng path/scene **không** ghi đè `cold_start` (OS thường bắn cả hai cho launch URL). Sau đó emit `boot:preload-complete`; `flushPendingDeepLink` không mở lại destination `cold_start`.

AASA / `assetlinks.json`: sửa trực tiếp `documents/deeplink/` (`TEAM_ID`, package/bundle id khớp `appId`, SHA-256 fingerprint) rồi upload lên server — không qua `.env`.
