# Mobile Build

## Overview

`fruloop` dùng Capacitor 7 để build native Android/iOS. Thư mục `android/` và `ios/` có thể được generate lại bằng scripts, còn native templates nằm trong `native/` và được apply sau `cap sync`.

---

## Scripts

| Command                      | Description                                                                                                 |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `npm run build`              | Typecheck bằng `tsc --noEmit` rồi Vite build vào `dist/`                                                    |
| `npm run game:verify-config` | Validate `VITE_GAME_ID` + release monetization gates + (production) API probe                               |
| `npm run cap:android`        | Mở Android Studio                                                                                           |
| `npm run cap:ios`            | Mở Xcode                                                                                                    |
| `npm run assets:generate`    | Generate icon/splash bằng `capacitor-assets`                                                                |
| `npm run build:android`      | Full Android pipeline: verify-config → build web → add platform if missing → assets → sync → native patches |
| `npm run build:ios`          | Full iOS pipeline: verify-config → build web → add platform if missing → assets → pods → sync → patches     |
| `npm run run:android`        | Build + emulator install + launch (`scripts/run-android-emulator.sh`)                                       |
| `npm run run:ios`            | Build + simulator install + launch (`scripts/run-ios-simulator.sh`)                                         |
| `npm run dev:android`        | Live reload trên emulator (`CAP_SERVER_URL=http://10.0.2.2:5173`)                                           |
| `npm run dev:ios`            | Live reload trên simulator (`CAP_SERVER_URL=http://localhost:5173`)                                         |

---

## Capacitor Config

File chính: `capacitor.config.ts`.

Current config:

| Field                                           | Value                     |
| ----------------------------------------------- | ------------------------- |
| `appId`                                         | `com.vraxion.fruloop`     |
| `appName`                                       | `Fruloop`                 |
| `webDir`                                        | `dist`                    |
| `server.androidScheme`                          | `https`                   |
| `SplashScreen.launchAutoHide`                   | `false`                   |
| `SplashScreen.backgroundColor`                  | `#6b97b2`                 |
| `StatusBar.overlaysWebView`                     | `true`                    |
| `plugins.PushNotifications.presentationOptions` | `alert`, `badge`, `sound` |

Khi tạo game mới, đổi ít nhất:

- `appId`
- `appName`
- Splash/icon assets trong `resources/` hoặc input của `capacitor-assets`

---

## Native Patch Flow

`build:android` và `build:ios` được triển khai bởi `scripts/native-ops.mjs`.

### Android (`build:android`)

```bash
npm run game:verify-config
npm run build
# cap add android (nếu chưa có android/)
npm run assets:generate
npx cap sync android
node scripts/apply-android-native.mjs
```

### iOS (`build:ios`)

```bash
npm run game:verify-config
npm run build
# cap add ios (nếu chưa có ios/)
npm run assets:generate
node scripts/apply-ios-native.mjs pre-sync   # pin UMP 3.0.0 trước pod install
(cd ios/App && pod install --repo-update)    # native-ops thực thi bước này
npx cap sync ios
node scripts/apply-ios-native.mjs            # post-sync: templates + AdMob + entitlements/deeplink
```

Các script trong `scripts/` merge template từ `native/` để giữ native changes repeatable sau mỗi lần regenerate platform.

`native-ops.mjs` chỉ hỗ trợ action `build` (`build android` hoặc `build ios`). Việc thêm platform khi thiếu nằm bên trong pipeline; không có action `ensure` riêng.

**Deep links (iOS):** `apply-ios-native.mjs` luôn copy/register `App.entitlements` và inject Associated Domains — không phụ thuộc push. Khi push tắt, script strip `aps-environment`. Chi tiết: [Deep-link setup](../deeplink/README.md).

**Firebase / FCM:** khi push enabled, `apply-android-native.mjs` / `apply-ios-native.mjs` copy `google-services.json` / `GoogleService-Info.plist`, permissions notification, và iOS `AppDelegate.swift` (+ giữ `aps-environment`). Chi tiết: [Firebase Native Setup](./firebase-native.md).

Hướng dẫn chi tiết build + chạy emulator/simulator (CLI & IDE): [Emulator and Simulator](../build/emulator-and-simulator.md).

---

## Runtime Native Behavior

Bootstrap native nằm ở `src/platform/bootstrap/capacitor.ts`.

Các event/lifecycle chính:

- `app:ready` → hide splash screen.
- Native app state change → emit `app:pause` / `app:resume`.
- `app:pause` / visibility hidden → `gameRunService.flush()` + `saveLocal` (+ analytics flush).
- Back button native → emit `app:back`.
- `app:resume` cũng kích hoạt game sync flush, mission reset checks, `dailyRewards.refreshOnResume()`, và **notification token refresh/flush / local schedule reconcile** (`notificationController` / `notificationService`).

---

## Release Notes

- Store builds: `VITE_APP_ENV=production` + `revenuecat` (cả hai keys) + `admob` (app + unit ids thật). `game:verify-config` enforce trước native build; runtime native production cũng block mock IAP/ads.
- Bật push: copy Firebase native config files + `VITE_FIREBASE_*` + backend `FIREBASE_*` (xem [firebase-native.md](./firebase-native.md)).
- API URL lấy từ preset `VITE_APP_ENV` trong `src/platform/core/config/index.ts` (hiện cả `development` và `production` đều trỏ Render; không có `VITE_API_URL`).
- Đảm bảo `VITE_GAME_ID` / `src/game/config.ts` khớp `GameId` enum trên `game-api`.

---

## Related Documentation

- [Firebase Native Setup](./firebase-native.md)
- [Notifications](../modules/notifications.md)
- [Environment Variables](./environment-variables.md)
- [Game run / mid-run save](../modules/game-run.md)
- [Emulator / Simulator](../build/emulator-and-simulator.md)
