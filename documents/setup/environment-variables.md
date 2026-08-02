# Environment Variables

## Overview

Tài liệu này mô tả các biến môi trường runtime của `fruloop`. Vì project dùng Vite, các biến đọc trong client phải có prefix `VITE_`.

`src/game/config.ts` khai báo display identity: `id` từ `VITE_GAME_ID`; `name`, `width`, `height`, `version`, `physics` chỉnh trong file.

---

## Core

```env
VITE_APP_ENV=development
VITE_GAME_ID=FRULOOP
```

| Variable       | Values                      | Default / Source             | Description                                                   |
| -------------- | --------------------------- | ---------------------------- | ------------------------------------------------------------- |
| `VITE_APP_ENV` | `development`, `production` | `development` khi chạy local | Chọn preset runtime trong `src/platform/core/config/index.ts` |
| `VITE_GAME_ID` | string                      | Bắt buộc                     | Game id dùng ở frontend và backend                            |

Preset API URL trong code (`src/platform/core/config/index.ts`):

| Env           | API URL                                  |
| ------------- | ---------------------------------------- |
| `development` | `https://game-api-s5kn.onrender.com/api` |
| `production`  | `https://game-api-s5kn.onrender.com/api` |

Cả hai preset hiện trỏ Render. Client **không** đọc `VITE_API_URL`. Để dùng API local, tạm sửa `apiUrl` trong `src/platform/core/config/index.ts`.

Production nên dùng HTTPS.

---

## IAP

```env
VITE_IAP_PROVIDER=mock
VITE_REVENUECAT_ANDROID_API_KEY=
VITE_REVENUECAT_IOS_API_KEY=
```

| Variable                          | Values               | Description                                   |
| --------------------------------- | -------------------- | --------------------------------------------- |
| `VITE_IAP_PROVIDER`               | `mock`, `revenuecat` | Bật IAP service theo `ENV_CONFIGS.iapEnabled` |
| `VITE_REVENUECAT_ANDROID_API_KEY` | string               | Public API key cho Android RevenueCat         |
| `VITE_REVENUECAT_IOS_API_KEY`     | string               | Public API key cho iOS RevenueCat             |

Hành vi khi thiếu key / dùng mock (`src/platform/bootstrap/providers.ts`):

| Context                                               | Behavior                                                     |
| ----------------------------------------------------- | ------------------------------------------------------------ |
| **Web** + `revenuecat` thiếu key                      | Fallback sang **mock** provider                              |
| **Native** + `revenuecat` thiếu key platform hiện tại | Log error, `iap.setEnabled(false)` — **không** fallback mock |
| **Native** production / Vite `PROD` native + `mock`   | IAP **disabled** (block mock trên store builds)              |

IAP service vẫn chỉ chạy khi `ENV_CONFIGS[env].iapEnabled` là `true` và provider đăng ký thành công.

---

## Ads

```env
VITE_ADS_PROVIDER=mock
VITE_ADMOB_ANDROID_APP_ID=
VITE_ADMOB_IOS_APP_ID=
```

| Variable                    | Values          | Description                                             |
| --------------------------- | --------------- | ------------------------------------------------------- |
| `VITE_ADS_PROVIDER`         | `mock`, `admob` | Web/dev dùng mock; native + `admob` dùng AdMob provider |
| `VITE_ADMOB_ANDROID_APP_ID` | string          | Android AdMob app id cho native build                   |
| `VITE_ADMOB_IOS_APP_ID`     | string          | iOS AdMob app id cho native build                       |

Nếu app id của platform hiện tại trống, runtime coi platform đó là testing và dùng Google sample ad units (trừ khi bị chặn bởi release gate bên dưới).

Hành vi production native:

| Context                                         | Behavior                                                               |
| ----------------------------------------------- | ---------------------------------------------------------------------- |
| Native production / Vite `PROD` native + `mock` | Ads **disabled**                                                       |
| Native + `admob` thiếu cấu hình                 | `ads.setEnabled(false)` — không silent-fallback mock trên store builds |

Production ad unit IDs (bắt buộc khi `game:verify-config` enforce release monetization):

```env
VITE_ADMOB_ANDROID_BANNER_ID=
VITE_ADMOB_ANDROID_INTERSTITIAL_ID=
VITE_ADMOB_ANDROID_REWARDED_ID=

VITE_ADMOB_IOS_BANNER_ID=
VITE_ADMOB_IOS_INTERSTITIAL_ID=
VITE_ADMOB_IOS_REWARDED_ID=
```

`apply-*-native` chỉ cho phép Google sample AdMob app ids khi `VITE_APP_ENV != production`.

---

## Release monetization gates

`npm run game:verify-config` (và mọi `build:android` / `build:ios` qua `native-ops.mjs`) enforce khi `VITE_APP_ENV=production` **hoặc** `ENFORCE_RELEASE_MONETIZATION=true`:

- `VITE_IAP_PROVIDER=revenuecat` + đủ cả hai RevenueCat keys
- `VITE_ADS_PROVIDER=admob` + đủ AdMob app id + 8 unit ids (banner / interstitial / rewarded × iOS / Android)
- Từ chối Google sample AdMob ids

API probe (chỉ khi `VITE_APP_ENV=production`, trừ khi `SKIP_API_CHECK=true`):

```
GET {apiUrl}/leaderboards?gameId={VITE_GAME_ID}&page=1&limit=1
```

404 = `gameId` chưa có trên backend.

Script-only env (không phải `VITE_*`): `ENFORCE_RELEASE_MONETIZATION`, `SKIP_API_CHECK`, `CAP_SERVER_URL`, biến emulator trong [emulator-and-simulator.md](../build/emulator-and-simulator.md).

---

## Firebase (Analytics + Push)

Cùng bộ `VITE_FIREBASE_*` dùng cho **Firebase Analytics** (khi `analyticsEnabled`) và là **điều kiện bật push** trên native (`pushNotificationsEnabled` trong `notification-env.json`).

```env
VITE_ANALYTICS_PROVIDER=firebase
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_MEASUREMENT_ID=
```

| Variable          | Description                                                             |
| ----------------- | ----------------------------------------------------------------------- |
| `VITE_FIREBASE_*` | Web config từ Firebase Console → Project settings → General → Your apps |

| Env           | Analytics               | Push (native) | Local notifications |
| ------------- | ----------------------- | ------------- | ------------------- |
| `development` | on (`analyticsEnabled`) | on\*\*        | on\*                |
| `production`  | on                      | on\*\*        | on\*                |

\* Local chỉ active trên native (`resolveLocalNotificationsEnabled()`).  
\*\* Push chỉ active khi `Capacitor.isNativePlatform()` **và** đủ 5 biến `VITE_FIREBASE_*` (`isFirebaseConfigured()`). Provider analytics (`console` / `firebase`) độc lập với cờ `analyticsEnabled`.

Flags merge từ `src/platform/core/config/notification-env.json` vào `ENV_CONFIGS` tại `src/platform/core/config/index.ts`.

Backend push (FCM gửi từ server) cần thêm `FIREBASE_*` trên `game-api` — xem [game-api environment variables](../../../game-api/documents/setup/environment-variables.md).

Native config files (`google-services.json`, `GoogleService-Info.plist`): [Firebase Native Setup](./firebase-native.md).

---

## Store listing

```env
VITE_IOS_APP_STORE_ID=
VITE_ANDROID_PACKAGE_ID=com.vraxion.fruloop
```

Các ID này được gắn vào link khi share điểm số và rate fallback. Android package mặc định là `com.vraxion.fruloop`; iOS App Store ID mặc định rỗng.

---

## Example `.env`

```env
VITE_APP_ENV=development
VITE_GAME_ID=FRULOOP

VITE_IAP_PROVIDER=mock
VITE_REVENUECAT_ANDROID_API_KEY=
VITE_REVENUECAT_IOS_API_KEY=

VITE_ADS_PROVIDER=mock
VITE_ANALYTICS_PROVIDER=console
VITE_ADMOB_ANDROID_APP_ID=
VITE_ADMOB_IOS_APP_ID=

VITE_IOS_APP_STORE_ID=
VITE_ANDROID_PACKAGE_ID=com.vraxion.fruloop
```

Store / release builds: set `VITE_APP_ENV=production` + real RevenueCat / AdMob values (xem comments trong `.env.example`).

---

## Deep links

Không dùng biến `.env`. Scheme + hosts khai báo trong:

- `src/platform/modules/deep-link/deep-link.config.ts` (runtime)
- `scripts/deeplink-config.mjs` (native apply scripts)

Hai file phải khớp. Chi tiết: [Deep-link setup](../deeplink/README.md).

---

## Related Documentation

- [Notifications](../modules/notifications.md)
- [Firebase Native Setup](./firebase-native.md)
- [Game Configuration](./game-configuration.md)
- [Mobile Build](./mobile-build.md)
- [Deep-link setup](../deeplink/README.md)
