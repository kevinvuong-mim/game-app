# Notifications

Module quản lý **push notification** (FCM) và **local notification** (daily reward reminder) trên native. Web platform bỏ qua toàn bộ flow.

## Phạm vi

| Loại                  | Nguồn                       | Khi nào                                                                                                           |
| --------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Push — Top 100 exited | Backend FCM                 | Guest #100 bị đẩy xuống rank >100 khi submitter có previous best ngoài Top-100 score band (xem API FCM jobs)      |
| Push — scheduled rank | Backend FCM (cron per-game) | Theo `GAME_CONFIG.rankPushCron` trên API (FRULOOP mặc định: 9:00 Thứ 7 VN); FCM type `rank_push`                  |
| Rank sau submit score | `POST /api/results`         | Client hiển thị in-app (Game Over, leaderboard cache)                                                             |
| Local — Daily reward  | Client schedule             | 07:00 mỗi sáng khi chưa claim (calendar cron); claim trước 07:00 thì bỏ hôm nay và arm horizon các sáng tiếp theo |

Push cần Firebase native + backend `FIREBASE_*`. Local chỉ cần `@capacitor/local-notifications`.

## Feature flags

Preset trong `src/platform/core/config/notification-env.json`, merge vào `ENV_CONFIGS` tại `src/platform/core/config/index.ts`:

| Env          | Push\* | Local\* |
| ------------ | ------ | ------- |
| `dev`        | on     | on      |
| `production` | on     | on      |

\* Push chỉ bật khi native + đủ `VITE_FIREBASE_*` (xem [Firebase Native Setup](../setup/firebase-native.md)). Local preset `on` cũng bị tắt trên web vì `resolveLocalNotificationsEnabled()` yêu cầu native.

## File chính

| File                               | Vai trò                                                                |
| ---------------------------------- | ---------------------------------------------------------------------- |
| `notification.service.ts`          | Orchestrator: init, tap handler, daily reward reconcile                |
| `push-notification.service.ts`     | Capacitor PushNotifications, đăng ký token lên API                     |
| `local-notification.service.ts`    | Schedule/cancel daily reward reminder                                  |
| `device-sync.service.ts`           | Offline-first token / unregister sync                                  |
| `android-notification-channel.ts`  | Android high-importance notification channel setup                     |
| `notification.repository.ts`       | `POST/PATCH/DELETE /devices`                                           |
| `notification.controller.ts`       | Bind lifecycle: `guest.onReady`, `app:resume`, `daily:claim`, settings |
| `notification.model.ts`            | Types, routes, `resolveNotificationRoute()`                            |
| `navigation/navigation.service.ts` | In-app navigation + pending queue (cold start)                         |

## Init flow

1. `App.init()` → `notificationController.bind(events)`.
2. Nếu `localNotificationsEnabled` → `reconcileDailyRewardSchedule(canClaim)` ngay khi bind (cold start).
3. `guest.onReady` → `notificationService.initializePush()` (khi `pushNotificationsEnabled`).
4. Push: xin quyền → `PushNotifications.register()` → listener `registration` → `POST /api/devices`.
5. Local: `LocalNotifications.requestPermissions()` rồi arm reminder 07:00 theo `canClaim`.

Chỉ chạy trên `Capacitor.isNativePlatform()`.

## Local daily reward reminder

Mục tiêu: **07:00 mỗi sáng nếu chưa claim** — không phụ thuộc “vừa claim hôm qua”.

| Trạng thái                               | Schedule                                                                                                    |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `canClaim === true`                      | Capacitor `on: { hour: 7, minute: 0 }` (calendar cron, lặp hàng ngày)                                       |
| Đã claim **sau** 07:00                   | Giữ / re-arm cùng cron (lần fire tiếp theo = sáng mai)                                                      |
| Đã claim **trước** 07:00                 | Cancel cron hôm nay; arm one-shot 07:00 cho **7 sáng tiếp theo** (`DAILY_REWARD_REMINDER_HORIZON_DAYS = 7`) |
| Cold start / `app:resume` / đổi ngôn ngữ | `reconcileDailyRewardSchedule(canClaim)`                                                                    |

Android channel id: `game_alerts` (khớp backend FCM). Local notification id base `1001`.

`at` + `repeats: true` **không** dùng: trên Android/iOS interval lặp = thời gian tới lần fire đầu (sai với daily).

## Device token lifecycle (client)

```
Permission granted → FCM token
  → POST /api/devices (lần đầu / ghi đè)   → data: { guestId }
  → PATCH /api/devices (token + locale)    → data: { guestId }
```

`DELETE /api/devices` được implement trong `deviceSyncService` / `pushNotificationService.unregister()`, nhưng **không** có settings toggle hiện tại để gọi unregister từ UI.

App resume: refresh FCM token + flush pending sync (không còn heartbeat endpoint).

State local: key `notification-state-v1` (durable storage → Preferences/IndexedDB; trên Preferences có prefix `gsk:`).

## Tap notification → màn trong app

**Không dùng deeplink URL.** Backend gửi FCM `data: { type, route, ...params }` (rank push gồm `rank`); local notification gắn `extra: { type, route }`.

| Nguồn / payload                                 | Scene mở      |
| ----------------------------------------------- | ------------- |
| FCM `type`: `top_100_exited` / `rank_push`      | `Leaderboard` |
| Local notification `extra.route`: `DailyReward` | `DailyReward` |
| (mặc định)                                      | `Home`        |

Luồng:

1. Push: `pushNotificationActionPerformed` → `notificationService.handleNotificationTap()`.
2. Local: `localNotificationActionPerformed` → `navigationService.navigateToScene()`.
3. `resolveNotificationRoute(type, route)` → scene key Phaser.
4. Navigate với `{ returnTo: 'Home' }`.

### Foreground push (app đang mở)

Khi nhận push trong foreground (`pushNotificationReceived`), `notificationService` hiển thị toast i18n (copy EN/VI khớp `game-api` notification templates):

| `type`                       | Toast key                                    |
| ---------------------------- | -------------------------------------------- |
| `top_100_exited`             | `notifications.top100Exited.body`            |
| `rank_push` (có `data.rank`) | `notifications.rankPush.body` với `{ rank }` |
| `rank_push` (thiếu rank)     | `notifications.rankPush.bodyFallback`        |

### Cold start (pending navigation)

Khi app bị kill, tap notification có thể tới **trước** khi Phaser sẵn sàng. `navigationService` **defer** payload cho đến `boot:preload-complete`:

1. Tap sớm → lưu `pending` (không navigate).
2. `PreloadScene.create()` emit `boot:preload-complete` → `navigationService.markBootComplete()`.
3. `PreloadScene` đọc `getBootNavigationTarget()` và `scene.start()` tới pending scene hoặc `Home`.

Khi callback tap được giao trước lúc Phaser preload xong, `navigationService` giữ destination trong bộ nhớ và defer việc chuyển scene.

## Events liên quan

| Event                          | Handler                                                                    |
| ------------------------------ | -------------------------------------------------------------------------- |
| cold start (`bind`)            | Local: reconcile theo `canClaim`                                           |
| `app:resume`                   | Push: refresh token + flush pending sync; local: reconcile theo `canClaim` |
| `daily:claim`                  | Local: reconcile với `canClaim=false` (bỏ 07:00 hôm nay nếu còn sớm)       |
| `settings:change` (`language`) | Push: `PATCH /api/devices`; local: re-arm title/body theo locale mới       |
| `boot:preload-complete`        | `markBootComplete()` + clear pending (PreloadScene navigate tới target)    |

## API backend

Xem [Devices API](../../../game-api/documents/apis/devices.md).

## Related Documentation

- [Firebase Native Setup](../setup/firebase-native.md)
- [Environment Variables](../setup/environment-variables.md)
- [Local features](./local-features.md)
