# Notifications

Module quản lý **push notification** (FCM) và **local notification** (daily reward reminder) trên native. Web platform bỏ qua toàn bộ flow.

## Phạm vi

| Loại                  | Nguồn                       | Khi nào                                                                                                                      |
| --------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Push — Top 100 exited | Backend FCM                 | Guest #100 bị đẩy xuống rank >100 khi một submitter vào Top 100 từ ngoài (xem API FCM jobs)                                 |
| Push — scheduled rank | Backend FCM (cron per-game) | Theo `GAME_CONFIG.rankPushCron` trên API (FRULOOP mặc định: 9:00 Thứ 7 VN); FCM type `rank_push`                             |
| Rank sau submit score | `POST /api/results`         | Client hiển thị in-app (Game Over, leaderboard cache)                                                                        |
| Local — Daily reward  | Client schedule             | 07:00 mỗi sáng (one-shot `at` horizon N ngày, `allowWhileIdle`); claim / past 07:00 thì bỏ hôm nay và arm các sáng tiếp theo |

Push cần Firebase native + backend `FIREBASE_*`. Local chỉ cần `@capacitor/local-notifications`.

## Feature flags

Preset trong `src/platform/core/config/notification-env.json`, merge vào `ENV_CONFIGS` tại `src/platform/core/config/index.ts`:

| Env           | Push\* | Local\* |
| ------------- | ------ | ------- |
| `development` | on     | on      |
| `production`  | on     | on      |

\* Push chỉ bật khi native + đủ `VITE_FIREBASE_*` (xem [Firebase Native Setup](../setup/firebase-native.md)). Local preset `on` cũng bị tắt trên web vì `resolveLocalNotificationsEnabled()` yêu cầu native.

## File chính

| File                               | Vai trò                                                        |
| ---------------------------------- | -------------------------------------------------------------- |
| `notification.service.ts`          | Orchestrator: init, tap handler, daily reward reconcile        |
| `push-notification.service.ts`     | Capacitor PushNotifications, đăng ký token lên API             |
| `local-notification.service.ts`    | Schedule/cancel daily reward reminder                          |
| `device-sync.service.ts`           | Offline-first token / unregister sync                          |
| `android-notification-channel.ts`  | Android high-importance notification channel setup             |
| `notification.repository.ts`       | `POST/PATCH/DELETE /devices`                                   |
| `notification.controller.ts`       | Bind lifecycle: `app:resume`, `daily:claim`, settings language |
| `notification.model.ts`            | Types, routes, planner, `resolveNotificationRoute()`           |
| `navigation/navigation.service.ts` | In-app navigation + pending queue (cold start)                 |

## Init flow

Thứ tự dialog hệ thống trên native cold start (orchestrated bởi `App.runPrivacyPromptSequence`):

1. **ATT** — `ads.init()` → AdMob `requestTrackingAuthorization` (iOS, khi ads bật).
2. **Notifications** — `notificationService.requestInitialPermissions()` (local và/hoặc push, tùy flag).
3. **UMP** — `ads.requestUmpConsentAndPreload()` (khi Google `REQUIRED`), rồi preload ads.

Sau bước 2: `App` gọi `notificationService.reconcileDailyRewardSchedule()` (lần reconcile đầu). `guest.onReady` → `initializePush()` (đăng ký FCM — đã chờ xong bước permission nên không đụng dialog ATT).

Chi tiết:

1. `App.init()` → `notificationController.bind(events)` — **chỉ gắn listeners** (`app:resume`, `daily:claim`, language); **không** reconcile tại `bind`.
2. `runPrivacyPromptSequence()` (fire-and-forget, không block game shell) → permission → **cold-start reconcile**.
3. Push sau guest ready: `PushNotifications.register()` → listener `registration` → `POST /api/devices`.
4. Local: sau permission, arm one-shot horizon 07:00 theo `dailyRewards.canClaim()` **đọc lúc job chạy** (không snapshot lúc enqueue).

Chỉ xin quyền / schedule trên `Capacitor.isNativePlatform()`.

## Local daily reward reminder

Mục tiêu: **07:00 local mỗi sáng** (`DAILY_REWARD_REMINDER_HOUR` / `_MINUTE`) nhắc claim.

Planner: `planDailyRewardReminderHorizon()` + `shouldSkipTodayDailyRewardReminder()` trong `notification.model.ts`.  
Scheduler: luôn one-shot `schedule.at` + `allowWhileIdle: true`, arm từng id, serialize reconcile (không dùng Capacitor `on`). Horizon luôn pad đủ `HORIZON_DAYS` slot tương lai (kể cả khi gần 07:00 bị lọc `minLeadMs`).

| Trạng thái                                 | Schedule                                       |
| ------------------------------------------ | ---------------------------------------------- |
| `canClaim === true` **trước** 07:00        | 07:00 hôm nay + đủ horizon các sáng tiếp       |
| `canClaim === true` **sau** 07:00          | Horizon từ **sáng mai** (đã lỡ cửa sổ hôm nay) |
| Đã claim (trước hoặc sau 07:00)            | Bỏ 07:00 hôm nay; arm horizon từ mai           |
| Cold start / `app:resume` / claim / locale | Cancel + re-arm (queue tuần tự)                |
| Permission bị tắt                          | Cancel pending; không schedule                 |

**`canClaim`:** mỗi lần `reconcileDailyRewardScheduleUnlocked` đọc `dailyRewards.canClaim()` tại thời điểm execute (tránh race resume snapshot `true` sau claim).

Android channel id: `game_alerts`. Notification ids `1001`…`1001+N-1`.

### Exact alarms (Android 12+)

`checkExactNotificationSetting()` khi reconcile. Nếu chưa granted: log warn; trên **`app:resume`** có thể mở settings một lần / process (`changeExactNotificationSetting`) — không prompt trong cold-start privacy sequence.

### Vì sao không dùng Capacitor `on` (calendar cron)?

| Platform    | Vấn đề với `on`                                                                                                         |
| ----------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Android** | Chỉ arm 1 AlarmManager shot có `allowWhileIdle`; sau fire reschedule `setExact(RTC)` → Doze nuốt sáng 2+.               |
| **iOS**     | Plugin cast `hour`/`minute` bằng `as? Int` — bridge `NSNumber` fail → `DateComponents` rỗng → cron không bao giờ match. |

`at` + `repeats: true` cũng không dùng (interval lặp = time-to-first-fire).

Ổn định cross-platform: mỗi sáng là one-shot `at` độc lập; mở app / claim kéo horizon tới. Log `Daily reward horizon scheduled` phải có `fireAt[]` đúng 07:00 local, `missingIds: []`.

**iOS Simulator:** local noti OK (khác push). Allow Notifications, tắt Focus/DND, đưa app về Home trước giờ fire.  
**Android:** cần Alarms & reminders (exact alarm) allowed; có `SCHEDULE_EXACT_ALARM` + `RECEIVE_BOOT_COMPLETED`.

## Device token lifecycle (client)

Headers cho `POST` / `PATCH` / `DELETE /api/devices`: `X-Api-Key` + `Authorization: Bearer <secretToken>`. Rate limit API: 10/60s per guest (chung key giữa 3 verb).

```
Permission granted → FCM token
  → POST /api/devices (lần đầu / ghi đè)   → data: { guestId }
  → PATCH /api/devices (token + locale)    → data: { guestId }
```

`DELETE /api/devices` được implement trong `deviceSyncService` / `pushNotificationService.unregister()`, nhưng **không** có settings toggle hiện tại để gọi unregister từ UI.

App resume: refresh FCM token + flush pending sync (không còn heartbeat endpoint).

State local: key `notification-state-v1` (durable storage → Preferences/IndexedDB; trên Preferences có prefix `gsk:`).

## Tap notification → màn trong app

**Không dùng deeplink URL.** Backend gửi FCM `data: { type, route, ...params }` — mọi value trên FCM data là **string** (client coerce `rank`). Rank push gồm `rank`; local notification gắn `extra: { route: 'DailyReward' }` (không có `type`).

| Nguồn / payload                                 | Scene mở      |
| ----------------------------------------------- | ------------- |
| FCM `type`: `top_100_exited` / `rank_push`      | `Leaderboard` |
| Local notification `extra.route`: `DailyReward` | `DailyReward` |
| (mặc định)                                      | `Home`        |

Luồng:

1. Push: `pushNotificationActionPerformed` → `notificationService.handleNotificationTap()`.
2. Local: `localNotificationActionPerformed` → `navigationService.navigateToScene()` (listener remove khi unbind controller).
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
3. `PreloadScene` đọc `peekPendingNavigation()` và `scene.start()` tới pending scene hoặc `Home`.

## Events liên quan

| Event                          | Handler                                                                     |
| ------------------------------ | --------------------------------------------------------------------------- |
| Cold start (`App` privacy seq) | Local: reconcile sau permission (không phải lúc `bind`)                     |
| `app:resume`                   | Push: refresh token + flush; local: reconcile + optional exact-alarm prompt |
| `daily:claim`                  | Local: reconcile (live `canClaim` lúc execute — thường skip hôm nay)        |
| `settings:change` (`language`) | Push: locale sync; local: re-arm title/body theo locale mới                 |
| `boot:preload-complete`        | `markBootComplete()`; PreloadScene `peekPendingNavigation()` rồi navigate   |

## API backend

Xem [Devices API](../../../game-api/documents/apis/devices.md).

## Related Documentation

- [Firebase Native Setup](../setup/firebase-native.md)
- [Environment Variables](../setup/environment-variables.md)
- [Local features](./local-features.md)
- [game-api FCM jobs](../../../game-api/documents/schedule/fcm-notification-jobs.md)
- [game-api Results API](../../../game-api/documents/apis/results.md)
