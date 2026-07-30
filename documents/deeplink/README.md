# Deeplink setup

Dev là subdomain của prod (`dev.*` → `*`), nên **một bộ file** dùng chung cho cả hai — chỉ khác domain host.

| File (trong repo)            | Host trên mỗi domain                                      |
| ---------------------------- | --------------------------------------------------------- |
| `apple-app-site-association` | `https://<domain>/.well-known/apple-app-site-association` |
| `assetlinks.json`            | `https://<domain>/.well-known/assetlinks.json`            |

| Environment | Domain ví dụ                     |
| ----------- | -------------------------------- |
| Dev         | `dev.gamestarterkit.example.com` |
| Prod        | `gamestarterkit.example.com`     |

Upload **cùng nội dung** lên `.well-known/` của từng domain (HTTPS, không redirect).

## Config (không qua `.env`)

Sửa scheme + hosts tại:

| File | Dùng cho |
| ---- | -------- |
| `src/platform/modules/deep-link/deep-link.config.ts` | Runtime (parser / `allowedHosts`) |
| `scripts/deeplink-config.mjs` | Native apply (`apply-ios-native` / `apply-android-native`) |

Hai file phải khớp nhau. Host active theo `VITE_APP_ENV` (`production` → prod, còn lại → dev).

## iOS (Universal Links)

1. Replace `TEAM_ID` trong `apple-app-site-association` bằng Apple Team ID.
2. Align `appIDs` bundle ids với `capacitor.config.ts` `appId` (hiện tại `com.studio.gamestarterkit`). Sample file dùng suffix `.dev` / `.prod` như placeholder — đổi cho khớp build thật trước khi publish.
3. Publish file giống nhau tại:
   - `https://dev.gamestarterkit.example.com/.well-known/apple-app-site-association`
   - `https://gamestarterkit.example.com/.well-known/apple-app-site-association`
4. Content-Type: `application/json` (không có extension `.json` trong URL).
5. Associated Domains entitlement được apply bởi `scripts/apply-ios-native.mjs` (cả hai host) — luôn chạy, không phụ thuộc push; khi push tắt script strip `aps-environment`.

## Android (App Links)

1. Replace `sha256_cert_fingerprints` bằng SHA-256 của keystore (release và/hoặc debug nếu cần test).
2. Align `package_name` với Capacitor `appId` (hiện tại `com.studio.gamestarterkit`). Sample `assetlinks.json` dùng `.dev` / `.prod` placeholder.
3. Publish file giống nhau tại:
   - `https://dev.gamestarterkit.example.com/.well-known/assetlinks.json`
   - `https://gamestarterkit.example.com/.well-known/assetlinks.json`
4. Intent filters (cả hai host) được inject bởi `scripts/apply-android-native.mjs`.

## Custom URL Scheme

Default scheme: `gamestarterkit://`

Supported paths (`src/platform/modules/deep-link/deep-link.model.ts`):

| Path | Scene |
| ---- | ----- |
| `/`, `/home` | `Home` |
| `/shop` | `Shop` |
| `/legal` | `Legal` |
| `/play`, `/gameplay` | `Gameplay` |
| `/missions` | `Missions` |
| `/settings` | `Settings` |
| `/how-to-play` | `HowToPlay` |
| `/leaderboard` | `Leaderboard` |
| `/daily-reward` | `DailyReward` |

Examples:

- `gamestarterkit://leaderboard`
- `https://dev.gamestarterkit.example.com/shop`
- `https://gamestarterkit.example.com/daily-reward`

## App flow

```
Deeplink URL
  → Capacitor App plugin (AppBridge)
  → DeepLinkService (pendingDeepLink on cold start)
  → EventBus (deeplink:received / deeplink:open)
  → navigationService.navigateToScene()
  → Phaser Scene
```

Cold start: `getLaunchUrl()` chạy trước Phaser boot; destination defer qua `navigationService` pending tới `PreloadScene`.

AASA / `assetlinks.json`: sửa trực tiếp `documents/deeplink/` (`TEAM_ID`, package/bundle id khớp `appId`, SHA-256 fingerprint) rồi upload lên server — không qua `.env`.
