# Deeplink setup

Dev là subdomain của prod, nên **một bộ file** dùng chung — chỉ khác domain host.

| File (trong repo)            | Host trên mỗi domain                                      |
| ---------------------------- | --------------------------------------------------------- |
| `apple-app-site-association` | `https://<domain>/.well-known/apple-app-site-association` |
| `assetlinks.json`            | `https://<domain>/.well-known/assetlinks.json`            |

| Environment | Domain                    |
| ----------- | ------------------------- |
| Dev         | `dev-fruloop.vraxion.com` |
| Prod        | `fruloop.vraxion.com`     |

Upload **cùng nội dung** lên `.well-known/` của từng domain (HTTPS, không redirect).

## Config (không qua `.env`)

Sửa scheme + hosts tại:

| File                                                 | Dùng cho                                                   |
| ---------------------------------------------------- | ---------------------------------------------------------- |
| `src/platform/modules/deep-link/deep-link.config.ts` | Runtime (parser / `allowedHosts`)                          |
| `scripts/deeplink-config.mjs`                        | Native apply (`apply-ios-native` / `apply-android-native`) |

Hai file phải khớp nhau. Host active theo `VITE_APP_ENV` (`production` → prod, còn lại → dev).

## iOS (Universal Links)

1. Replace `TEAM_ID` trong `apple-app-site-association` bằng Apple Team ID thật trước khi publish.
2. `appIDs` phải khớp Capacitor `appId` (`com.vraxion.fruloop`) — dạng `TEAM_ID.com.vraxion.fruloop`.
3. Publish file giống nhau tại:
   - `https://dev-fruloop.vraxion.com/.well-known/apple-app-site-association`
   - `https://fruloop.vraxion.com/.well-known/apple-app-site-association`
4. Content-Type: `application/json` (không có extension `.json` trong URL).
5. Associated Domains entitlement được apply bởi `scripts/apply-ios-native.mjs` (cả hai host) — luôn chạy, không phụ thuộc push; khi push tắt script strip `aps-environment`. Khi `VITE_APP_ENV=production` và push bật, script set `aps-environment` = `production`.

## Android (App Links)

1. Replace `sha256_cert_fingerprints` bằng SHA-256 của keystore (release và/hoặc debug nếu cần test).
2. `package_name` phải khớp Capacitor `appId`: `com.vraxion.fruloop`.
3. Publish file giống nhau tại:
   - `https://dev-fruloop.vraxion.com/.well-known/assetlinks.json`
   - `https://fruloop.vraxion.com/.well-known/assetlinks.json`
4. Intent filters (cả hai host) được inject bởi `scripts/apply-android-native.mjs`.

## Custom URL Scheme

Default scheme: `fruloop://`

Supported paths (`src/platform/modules/deep-link/deep-link.model.ts`):

| Path                 | Scene         |
| -------------------- | ------------- |
| `/`, `/home`         | `Home`        |
| `/shop`              | `Shop`        |
| `/legal`             | `Legal`       |
| `/play`, `/gameplay` | `Gameplay`    |
| `/missions`          | `Missions`    |
| `/settings`          | `Settings`    |
| `/leaderboard`       | `Leaderboard` |
| `/daily-reward`      | `DailyReward` |
| `/how-to-play`       | `HowToPlay`   |

Examples:

- `fruloop://leaderboard`
- `https://dev-fruloop.vraxion.com/shop`
- `https://fruloop.vraxion.com/daily-reward`

## App flow

```
Deeplink URL
  → Capacitor App plugin (AppBridge)
  → DeepLinkService (pendingDeepLink on cold start)
  → EventBus (deeplink:open)
  → navigationService.navigateToScene()
  → Phaser Scene
```

Cold start: `getLaunchUrl()` chạy trước Phaser boot; destination defer qua `navigationService` pending tới `PreloadScene` (Preload peeks pending navigation). Sau khi Preload đã peek cold-start link, `flushPendingDeepLink` không mở lại cùng destination.

AASA / `assetlinks.json`: sửa trực tiếp `documents/deeplink/` (`TEAM_ID`, package/bundle id khớp `appId`, SHA-256 fingerprint) rồi upload lên server — không qua `.env`.
