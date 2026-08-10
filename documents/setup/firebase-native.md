# Firebase Native Setup (Android & iOS)

Hướng dẫn cấu hình Firebase Cloud Messaging (FCM) cho push notification trên native.

**Bundle ID / Package name:** `com.vraxion.fruloop` (khớp `capacitor.config.ts`)

---

## 1. Tạo Firebase Project

1. Mở [Firebase Console](https://console.firebase.google.com/)
2. Tạo project mới (hoặc dùng project hiện có)
3. Bật **Cloud Messaging** trong project settings

---

## 2. Thêm Android App

1. Firebase Console → Add app → **Android**
2. Package name: `com.vraxion.fruloop`
3. Download `google-services.json`
4. Copy vào:

```
native/firebase/google-services.json
```

File này **không commit** (đã có trong `.gitignore`). Dùng `native/firebase/google-services.json.example` làm tham chiếu.

---

## 3. Thêm iOS App

1. Firebase Console → Add app → **iOS**
2. Bundle ID: `com.vraxion.fruloop`
3. Download `GoogleService-Info.plist`
4. Copy vào:

```
native/firebase/GoogleService-Info.plist
```

### Upload APNs Key lên Firebase

1. [Apple Developer Portal](https://developer.apple.com/account/resources/authkeys/list) → Keys → tạo key mới
2. Bật **Apple Push Notifications service (APNs)**
3. Download file `.p8`
4. Firebase Console → Project Settings → Cloud Messaging → iOS app
5. Upload **APNs Authentication Key** (.p8) + Key ID + Team ID

> Push notification **không hoạt động trên iOS Simulator**. Cần thiết bị thật.

---

## 4. Client env

Push/local bật theo `src/platform/core/config/notification-env.json`, merge vào `ENV_CONFIGS` trong `src/platform/core/config/index.ts`:

| Env           | Push\* | Local\* |
| ------------- | ------ | ------- |
| `development` | on     | on      |
| `production`  | on     | on      |

\* Push chỉ thực sự bật khi native **và** đủ 5 biến Firebase sau. Local cũng bị tắt trên web vì `resolveLocalNotificationsEnabled()` yêu cầu native.

```env
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_MEASUREMENT_ID=
```

---

## 5. Build native

Scripts tự động apply Firebase config từ `native/` templates:

```bash
# Android
npm run build:android

# iOS
npm run build:ios
```

Hoặc chạy pipeline tương đương thủ công (sau `npm run build`, `npm run assets:generate`, và `cap add` nếu platform chưa tồn tại):

```bash
# Android
npx cap sync android
node scripts/apply-android-native.mjs

# iOS
node scripts/apply-ios-native.mjs pre-sync
(cd ios/App && pod install --repo-update)
npx cap sync ios
node scripts/apply-ios-native.mjs
```

### Android — script tự động:

- Copy `google-services.json` → `android/app/`
- Inject `com.google.gms:google-services` Gradle plugin (`android/build.gradle` + `android/app/build.gradle`)
- Thêm permissions: `POST_NOTIFICATIONS`, `SCHEDULE_EXACT_ALARM`, `RECEIVE_BOOT_COMPLETED`, `VIBRATE`
- Thêm FCM default notification channel metadata

> Android **không cần** `AppDelegate` tương đương. Firebase tự init qua Gradle + `google-services.json`, và Capacitor trả FCM token trực tiếp. Chi tiết Android permissions/channel: xem `scripts/apply-android-native.mjs`.

### iOS — script tự động (khi push enabled):

- Thêm `FirebaseMessaging` pod
- Copy `AppDelegate.swift` (Firebase init + FCM token bridge)
- Giữ `aps-environment` trong `App.entitlements` (template luôn được copy cho Universal Links; khi push tắt script strip key này)
- Copy `GoogleService-Info.plist` → `ios/App/App/`
- Thêm `UIBackgroundModes: remote-notification` vào Info.plist

> `App.entitlements` được apply **luôn** (kể cả khi push tắt) để gắn Associated Domains cho Universal Links. Chi tiết: [Deep-link setup](../deeplink/README.md).

---

## 6. Xcode — bước thủ công (iOS)

Sau `npm run build:ios`, mở Xcode:

```bash
npm run cap:ios
```

Kiểm tra:

1. **Signing & Capabilities** → thêm **Push Notifications**
2. **Signing & Capabilities** → **Background Modes** → bật **Remote notifications**
3. `GoogleService-Info.plist` có trong target **App** → Build Phases → Copy Bundle Resources
4. `App.entitlements` được gán trong Build Settings → Code Signing Entitlements (`aps-environment` + Associated Domains)

> Nếu build release (`VITE_APP_ENV=production`) và bật push, `apply-ios-native.mjs` tự set `aps-environment` = `production` trên bản copy trong `ios/`. Template `native/ios/App.entitlements` mặc định vẫn là `development` cho local.

---

## 7. Kiểm tra

### Android

1. Cài app trên thiết bị/emulator (API 33+ sẽ hỏi quyền notification)
2. Mở app → guest init → FCM token gửi lên `POST /api/devices`
3. Firebase Console → Messaging → Send test message → dùng FCM token

### iOS

1. Cài trên **thiết bị thật** (không simulator)
2. Cho phép notification khi được hỏi
3. Kiểm tra token đăng ký trên backend
4. Gửi test từ Firebase Console

### Daily Reward (Local Notification)

1. Cold start: sau notification permission, `App` reconcile horizon **07:00 mỗi sáng** theo `dailyRewards.canClaim()`
2. Resume / claim / đổi ngôn ngữ → cancel + re-arm (queue tuần tự; `canClaim` đọc lúc job chạy)
3. Claim trước 07:00 → bỏ nudge hôm nay, giữ các sáng tiếp theo
4. Tap notification → mở `DailyReward` scene (`extra.route: 'DailyReward'`)

### Push — scheduled rank (`rank_push`)

1. Backend gửi FCM với `data: { type, route, rank? }` (ví dụ `rank_push`, `route: Leaderboard`, `rank: "42"`)
2. Tap notification → in-app navigation tới `Leaderboard` (không dùng deeplink URL)
3. Foreground: toast dùng `notifications.rankPush.body` với `{ rank }`, hoặc `bodyFallback` nếu thiếu rank
4. Cold start: navigation được defer cho đến sau preload assets; `navigationService` subscribe `boot:preload-complete` để `markBootComplete()`

---

## 8. Tap notification & navigation

Client **không dùng deeplink URL**. Flow:

| Nguồn               | Payload                    | Scene mở                               |
| ------------------- | -------------------------- | -------------------------------------- |
| Push scheduled rank | `data.type` + `data.route` | `Leaderboard`; foreground → toast i18n |
| Local daily reward  | `extra.route`              | `DailyReward`                          |

**Cold start:** Nếu user tap notification khi app bị kill, `navigationService` lưu pending destination. Sau preload assets, `PreloadScene` emit `boot:preload-complete` (listener gọi `markBootComplete()`), đọc `peekPendingNavigation()`, rồi navigate tới target scene.

Chi tiết module: [Notifications](../modules/notifications.md).

Backend device API: [Devices API](../../../game-api/documents/apis/devices.md).

---

## Troubleshooting

| Vấn đề                                 | Giải pháp                                                                                                                          |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Android không nhận push                | Kiểm tra `google-services.json` trong `android/app/`                                                                               |
| iOS token là APNs thay vì FCM          | Đảm bảo `AppDelegate.swift` template đã apply, `FirebaseMessaging` pod đã cài                                                      |
| `no valid aps-environment entitlement` | Thêm Push Notifications capability trong Xcode                                                                                     |
| Backend skip push                      | Kiểm tra `FIREBASE_*` env vars, xem log `Firebase is not configured`                                                               |
| Permission denied Android 13+          | App sẽ skip gracefully; user cần bật trong Settings                                                                                |
| Tap push cold start không mở đúng màn  | Kiểm tra `boot:preload-complete` và log `[Navigation] Deferring navigation`; xem [notifications.md](../modules/notifications.md)   |
| `pod install` lỗi GoogleUtilities      | Chạy lại `npm run build:ios` (script đã dùng `pod install --repo-update`) hoặc thủ công: `cd ios/App && pod install --repo-update` |

---

## File structure

```
native/
├── firebase/
│   ├── google-services.json          # gitignored — Android FCM
│   ├── GoogleService-Info.plist      # gitignored — iOS FCM
│   ├── google-services.json.example
│   └── GoogleService-Info.plist.example
├── android/
│   └── MainActivity.java
└── ios/
    ├── AppDelegate.swift             # Firebase + FCM token bridge
    ├── App.entitlements              # Associated Domains (+ aps-environment khi push on)
    └── FullscreenBridgeViewController.swift
```

## Related Documentation

- [Notifications module](../modules/notifications.md)
- [Deep-link setup](../deeplink/README.md)
- [Environment Variables](./environment-variables.md)
- [Mobile Build](./mobile-build.md)
- [game-api Devices API](../../../game-api/documents/apis/devices.md)
