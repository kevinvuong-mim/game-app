# Environment Variables

## Overview

Tài liệu này mô tả các biến môi trường runtime của `fruloop`. Vì project dùng Vite, các biến đọc trong client phải có prefix `VITE_`.

`src/game/config.ts` là nơi khai báo game identity: `id` và `replaySecret` đọc từ `.env` (`VITE_GAME_ID`, `VITE_REPLAY_SECRET`); `name`, `width`, `height`, `version` chỉnh trực tiếp trong file.

---

## Core

```env
VITE_APP_ENV=dev
VITE_GAME_ID=FRULOOP
VITE_REPLAY_SECRET=<64-char-lowercase-sha256-hex>
```

| Variable             | Values                         | Default / Source     | Description                                                                  |
| -------------------- | ------------------------------ | -------------------- | ---------------------------------------------------------------------------- |
| `VITE_APP_ENV`       | `dev`, `production`        | `dev` khi chạy local | Chọn preset runtime trong `src/platform/core/config/index.ts`                |
| `VITE_GAME_ID`       | string                         | Bắt buộc             | Game id dùng ở frontend và backend                                           |
| `VITE_REPLAY_SECRET` | string                         | Bắt buộc             | Secret replay — phải khớp `GAME_CONFIG[gameId].replaySecret` trên `game-api` |

Preset API URL trong code (`src/platform/core/config/index.ts`):

| Env          | API URL                                  |
| ------------ | ---------------------------------------- |
| `dev`        | `http://localhost:3000/api`              |
| `production` | `https://game-api-s5kn.onrender.com/api` |

`VITE_REPLAY_SECRET` phải là **64-char lowercase hex** (`/^[0-9a-f]{64}$/`). Secret sai/thiếu → client **không sync** và **giữ** offline queue (không xóa im lặng).

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

Nếu `VITE_IAP_PROVIDER=revenuecat` nhưng không đủ điều kiện native + API key, app fallback sang mock provider. IAP service vẫn chỉ chạy khi `ENV_CONFIGS[env].iapEnabled` là `true`.

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

Nếu app id của platform hiện tại không có giá trị, code sẽ coi platform đó là testing và dùng Google sample ad units.

Production ad unit IDs chỉ cần khi muốn dùng ad unit thật:

```env
VITE_ADMOB_ANDROID_BANNER_ID=
VITE_ADMOB_ANDROID_INTERSTITIAL_ID=
VITE_ADMOB_ANDROID_REWARDED_ID=
VITE_ADMOB_ANDROID_APP_OPEN_ID=

VITE_ADMOB_IOS_BANNER_ID=
VITE_ADMOB_IOS_INTERSTITIAL_ID=
VITE_ADMOB_IOS_REWARDED_ID=
VITE_ADMOB_IOS_APP_OPEN_ID=
```

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

| Env          | Analytics                  | Push (native) | Local notifications |
| ------------ | -------------------------- | ------------- | ------------------- |
| `dev`        | off (`analyticsEnabled`)   | off           | on\*                |
| `production` | on                         | on\*\*        | on\*                |

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

Các ID này được gắn vào link khi share điểm số. Android package mặc định là `com.vraxion.fruloop`; iOS App Store ID mặc định rỗng.

---

## Example `.env`

```env
VITE_APP_ENV=dev
VITE_GAME_ID=FRULOOP
VITE_REPLAY_SECRET=<64-char-lowercase-sha256-hex>

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
