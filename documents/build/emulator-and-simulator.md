# Build & Run trên Emulator / Simulator

Tài liệu này mô tả end-to-end cách build native app và chạy trên **Android Emulator** hoặc **iOS Simulator**, theo đúng luồng đã verify trong project.

> **Lưu ý:** Chạy trên **iOS Simulator không cần Apple Developer Program** (tài khoản trả phí $99/năm). Chỉ cần Xcode trên Mac. Muốn cài lên iPhone thật hoặc publish App Store thì mới cần developer account.

---

## Scripts tự động (build + run)

Hai script one-command — build native rồi mở app trên emulator/simulator:

| Command               | Script                            | Mô tả                                                                                                                    |
| --------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `npm run run:android` | `scripts/run-android-emulator.sh` | `build:android` (qua `scripts/native-ops.mjs`) → `assembleDebug` → boot emulator (nếu chưa có device) → cài APK → launch |
| `npm run run:ios`     | `scripts/run-ios-simulator.sh`    | `build:ios` (qua `scripts/native-ops.mjs`) → `xcodebuild` (simulator) → boot simulator → cài `.app` → launch             |

## Live reload khi phát triển

Để build/cài native một lần rồi tự reload khi sửa web code:

```bash
npm run dev:android
# hoặc
npm run dev:ios
```

Script tự khởi động Vite, inject URL dev vào Capacitor, build và mở app. Giữ terminal
đó chạy; các thay đổi trong `src/` sẽ được Vite cập nhật trên emulator/simulator.
Nhấn `Ctrl+C` để dừng.

URL mặc định:

- Android Emulator: `http://10.0.2.2:5173`
- iOS Simulator: `http://localhost:5173`

Với thiết bị thật, máy dev và thiết bị phải cùng mạng Wi-Fi rồi truyền IP LAN:

```bash
CAP_SERVER_URL=http://192.168.1.10:5173 npm run dev:android
CAP_SERVER_URL=http://192.168.1.10:5173 npm run dev:ios
```

`CAP_SERVER_URL` chỉ được thêm khi chạy lệnh dev. Các lệnh build thông thường không
đóng gói URL máy dev vào app production. Cần build lại native khi đổi plugin,
Capacitor config hoặc native code; thay đổi TypeScript/CSS/assets chỉ cần live reload.

### Biến môi trường tuỳ chọn

**Android** (`run:android`):

| Variable               | Mô tả                                                        |
| ---------------------- | ------------------------------------------------------------ |
| `ANDROID_AVD`          | Tên AVD (mặc định: AVD đầu tiên trong `emulator -list-avds`) |
| `ANDROID_HEADLESS=1`   | Emulator không cửa sổ (CI)                                   |
| `SKIP_BUILD=1`         | Bỏ qua `npm run build:android` (native-ops build helper)     |
| `SKIP_GRADLE=1`        | Bỏ qua `./gradlew assembleDebug`                             |
| `BOOT_TIMEOUT_SEC=300` | Timeout chờ emulator boot                                    |
| `SHOW_LOGS=1`          | Tail `adb logcat` Capacitor sau khi launch                   |

**iOS** (`run:ios`):

| Variable             | Mô tả                                                     |
| -------------------- | --------------------------------------------------------- |
| `IOS_SIMULATOR_UDID` | UUID simulator (mặc định: đang boot hoặc iPhone đầu tiên) |
| `SKIP_BUILD=1`       | Bỏ qua `npm run build:ios` (native-ops build helper)      |
| `SKIP_XCODEBUILD=1`  | Dùng lại build trong `.derived-data/ios`                  |
| `SHOW_LOGS=1`        | In log simulator 1 phút gần nhất                          |

Ví dụ:

```bash
# Android — AVD cụ thể + xem log
ANDROID_AVD=Medium_Phone_API_36.1 SHOW_LOGS=1 npm run run:android

# iOS — chỉ rebuild native, giữ web build cũ
SKIP_BUILD=1 npm run run:ios

# Lặp nhanh sau khi sửa JS (đã build web trước đó)
npm run build && SKIP_BUILD=1 npm run run:android
```

---

## Yêu cầu hệ thống

| Thành phần      | Android                            | iOS                           |
| --------------- | ---------------------------------- | ----------------------------- |
| OS              | macOS / Linux / Windows            | **macOS** (bắt buộc)          |
| Node.js         | ≥ 20                               | ≥ 20                          |
| IDE / SDK       | Android Studio + Android SDK       | **Xcode** (kèm iOS Simulator) |
| Biến môi trường | `ANDROID_HOME` trỏ tới Android SDK | Không bắt buộc thêm           |
| Java            | JDK 17 (Gradle Android)            | —                             |

Kiểm tra nhanh:

```bash
node -v          # >= 20
java -version    # 17.x
echo $ANDROID_HOME
xcodebuild -version
```

---

## Chuẩn bị trước khi build

### 1. Cài dependency

```bash
cd game-starter-kit
npm install
```

### 2. Cấu hình `.env`

Copy từ `.env.example` nếu chưa có:

```bash
cp .env.example .env
```

Các biến quan trọng khi chạy native với AdMob:

```env
VITE_APP_ENV=dev
VITE_GAME_ID=FRULOOP

VITE_ADS_PROVIDER=admob

VITE_ADMOB_ANDROID_APP_ID=ca-app-pub-xxxxxxxx~xxxxxxxx
VITE_ADMOB_IOS_APP_ID=ca-app-pub-xxxxxxxx~xxxxxxxx
```

- Thiếu `VITE_ADMOB_ANDROID_APP_ID` hoặc `VITE_ADMOB_IOS_APP_ID` trên platform tương ứng → runtime dùng Google sample ad units; native build script inject Google sample App ID khi `VITE_ADS_PROVIDER=admob`.
- `VITE_ADS_PROVIDER=admob` → script native inject AdMob App ID vào manifest/Info.plist (dùng App ID thật nếu có, không thì sample ID của Google).

Chi tiết biến môi trường: [Environment Variables](../setup/environment-variables.md).

### 3. Backend API (tuỳ chọn nhưng khuyến nghị)

App gọi guest init, leaderboard, game sync qua API URL theo `VITE_APP_ENV` trong `src/platform/core/config/index.ts`. Preset `dev` và `production` đều dùng `https://game-api-s5kn.onrender.com/api` (khớp `scripts/verify-game-config.mjs`).

Để test với `game-api` local, tạm sửa `apiUrl` trong config rồi (nếu Android emulator) reverse cổng:

```bash
cd ../game-api
npm run start:dev

# Terminal khác, sau khi Android emulator đã boot (chỉ khi apiUrl trỏ localhost):
adb reverse tcp:3000 tcp:3000
```

---

## Luồng build native

Thư mục `android/` và `ios/` được generate bởi Capacitor và **gitignored**. Scripts `build:android` / `build:ios` tự đảm nhiệm add platform nếu thiếu, rồi generate assets, sync và apply native patches qua `scripts/native-ops.mjs`.

### Android

```bash
npm run build:android
```

Thứ tự thực thi:

1. `npm run build` — typecheck + Vite build → `dist/`
2. `cap add android` (nếu chưa có `android/`)
3. `capacitor-assets generate` — icon/splash
4. `cap sync android` — copy web assets + cập nhật plugins
5. `node scripts/apply-android-native.mjs` — apply `MainActivity` (package từ `capacitor.config.ts`), inject AdMob + Google Services Gradle

Compile APK debug:

```bash
cd android
./gradlew assembleDebug
```

APK output:

```
android/app/build/outputs/apk/debug/app-debug.apk
```

### iOS

```bash
npm run build:ios
```

Thứ tự thực thi:

1. `npm run build` — typecheck + Vite build → `dist/`
2. `cap add ios` (nếu chưa có `ios/`)
3. `capacitor-assets generate` — icon/splash
4. **`node scripts/apply-ios-native.mjs pre-sync`** — pin `GoogleUserMessagingPlatform 3.0.0` trong Podfile **trước** `pod install`
5. `pod install --repo-update` trong `ios/App`
6. `cap sync ios` — copy web assets + cập nhật plugins
7. `node scripts/apply-ios-native.mjs` — copy storyboard/Swift/`App.entitlements`, inject AdMob + Associated Domains (Universal Links)

> **Quan trọng (iOS + AdMob):** `@capacitor-community/admob@7.x` cần UMP **3.0.0**. Script `pre-sync` pin đúng phiên bản (và upgrade pin cũ `~> 2.3` nếu còn). Nếu đổi Podfile hoặc gặp lỗi CocoaPods, xóa lock rồi cài lại:
>
> ```bash
> cd ios/App
> rm -f Podfile.lock
> pod install
> ```

Compile cho simulator (CLI):

```bash
cd ios/App
xcodebuild \
  -workspace App.xcworkspace \
  -scheme App \
  -configuration Debug \
  -destination 'generic/platform=iOS Simulator' \
  build
```

---

## Chạy trên Android Emulator

### Cách 1: Android Studio (khuyến nghị cho dev hàng ngày)

```bash
npm run build:android
npm run cap:android
```

Trong Android Studio:

1. Chọn AVD (Device Manager → Create/start emulator).
2. **Run** (▶) hoặc `Shift+F10`.

### Cách 2: CLI — emulator có UI

Liệt kê AVD:

```bash
$ANDROID_HOME/emulator/emulator -list-avds
```

Khởi động emulator (thay tên AVD):

```bash
$ANDROID_HOME/emulator/emulator -avd Medium_Phone_API_36.1 &
```

Đợi boot xong:

```bash
adb wait-for-device
adb shell getprop sys.boot_completed   # trả về 1 khi sẵn sàng
```

Cài APK và mở app:

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n com.vraxion.fruloop/.MainActivity
```

Hoặc dùng Gradle (cài + launch một lần):

```bash
cd android
./gradlew installDebug
```

### Cách 3: CLI — emulator headless (CI / không cần cửa sổ)

```bash
$ANDROID_HOME/emulator/emulator \
  -avd Medium_Phone_API_36.1 \
  -no-window \
  -no-snapshot-load \
  -no-audio \
  -no-boot-anim \
  -gpu swiftshader_indirect &
```

Đợi boot:

```bash
adb wait-for-device
until [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; do sleep 2; done
```

Sau đó `adb install` / `am start` như trên.

> Emulator headless có thể boot chậm (1–3 phút lần đầu). Nếu `adb devices` trống, đảm bảo process emulator vẫn chạy (`pgrep -fl qemu`).

### Kiểm tra app Android chạy ổn

```bash
# Process còn sống
adb shell pidof com.vraxion.fruloop

# Log app (Capacitor / crash)
adb logcat -d | grep -iE "Capacitor/Console|FATAL|AndroidRuntime|fruloop" | tail -40
```

Log healthy thường thấy:

- `[Platform] [App] Platform ready`
- `[Platform] [App] Game shell ready`
- `Phaser v3.x (WebGL | Web Audio)`

**Không có** dòng `FATAL EXCEPTION`.

### Lỗi AdMob trên emulator (không phải crash)

Trên emulator, preload ad có thể fail với:

```
Unable to obtain a JavascriptEngine.
```

Đây là giới hạn phổ biến của Google Ads trên emulator — app vẫn chạy, chỉ warn trong log. Test ads thật nên dùng **device thật**.

Crash launch do thiếu AdMob App ID (đã fix bằng native script):

```
The Google Mobile Ads SDK was initialized incorrectly...
```

Verify App ID trong APK:

```bash
AAPT=$(ls -d $ANDROID_HOME/build-tools/*/aapt | tail -1)
"$AAPT" dump xmltree android/app/build/outputs/apk/debug/app-debug.apk AndroidManifest.xml \
  | grep -A2 APPLICATION_ID
```

---

## Chạy trên iOS Simulator

### Cách 1: Xcode (khuyến nghị)

```bash
npm run build:ios
npm run cap:ios
```

Trong Xcode:

1. Chọn simulator (vd. iPhone 17).
2. **Run** (▶) hoặc `Cmd+R`.

Không cần signing team cho simulator.

### Cách 2: CLI — build, cài, launch

Liệt kê simulator:

```bash
xcrun simctl list devices available | grep iPhone
```

Boot simulator (thay UUID):

```bash
xcrun simctl boot CF2B744E-3ACC-4E6D-A401-BB7DD5CDDE16
open -a Simulator
```

Build (nếu chưa build):

```bash
cd ios/App
xcodebuild \
  -workspace App.xcworkspace \
  -scheme App \
  -configuration Debug \
  -destination 'id=CF2B744E-3ACC-4E6D-A401-BB7DD5CDDE16' \
  build
```

Tìm `.app` đã build:

```bash
APP=$(find ~/Library/Developer/Xcode/DerivedData/App-*/Build/Products/Debug-iphonesimulator \
  -name "App.app" -maxdepth 1 | head -1)
echo "$APP"
```

Cài và chạy:

```bash
xcrun simctl install booted "$APP"
xcrun simctl launch booted com.vraxion.fruloop
```

(`booted` = simulator đang mở)

### Kiểm tra app iOS chạy ổn

```bash
# Log app (2 phút gần nhất)
xcrun simctl spawn booted log show \
  --predicate 'process == "App"' \
  --last 2m --style compact | tail -30
```

Healthy: thấy `GoogleMobileAds/Settings` được tạo, WebKit load `https://localhost/`, không có crash report.

Kiểm tra crash report:

```bash
ls ~/Library/Logs/DiagnosticReports/*gamestarter* 2>/dev/null
ls ~/Library/Logs/DiagnosticReports/App*.ips 2>/dev/null
```

Không có file `.ips` mới → không crash.

Verify AdMob trong Info.plist:

```bash
/usr/libexec/PlistBuddy -c "Print :GADApplicationIdentifier" ios/App/App/Info.plist
```

---

## Tóm tắt lệnh nhanh

### Android — full flow CLI

```bash
cd game-starter-kit
npm run build:android
cd android && ./gradlew assembleDebug

$ANDROID_HOME/emulator/emulator -avd <TEN_AVD> &
adb wait-for-device
until [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; do sleep 2; done

adb install -r app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n com.vraxion.fruloop/.MainActivity
adb logcat -s Capacitor/Console
```

### iOS — full flow CLI

```bash
cd game-starter-kit
npm run build:ios
open -a Simulator

cd ios/App
xcodebuild -workspace App.xcworkspace -scheme App -configuration Debug \
  -destination 'generic/platform=iOS Simulator' build

APP=$(find ~/Library/Developer/Xcode/DerivedData/App-*/Build/Products/Debug-iphonesimulator \
  -name "App.app" -maxdepth 1 | head -1)
xcrun simctl install booted "$APP"
xcrun simctl launch booted com.vraxion.fruloop
```

---

## Troubleshooting

| Triệu chứng                                       | Nguyên nhân / Cách xử lý                                                                                                 |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Android crash ngay khi mở, log AdMob SDK          | Thiếu `com.google.android.gms.ads.APPLICATION_ID` → chạy lại `npm run build:android` (script `apply-android-native.mjs`) |
| iOS crash AdMob lúc launch                        | Thiếu `GADApplicationIdentifier` → chạy lại `npm run build:ios`                                                          |
| iOS `pod install` conflict UMP / AdMob            | Chạy `apply-ios-native.mjs pre-sync` (pin UMP `3.0.0`) **trước** `cap sync`; xóa `Podfile.lock` + `pod install` |
| `No connected devices!` (Gradle)                  | Emulator/device chưa boot — `adb devices` phải thấy `device`                                                             |
| Emulator không hiện trong `adb devices`           | Process emulator chết sớm — chạy lại với `-gpu swiftshader_indirect` hoặc mở từ Android Studio                           |
| API guest/leaderboard fail trên Android emulator  | Start API trên host, chạy `adb reverse tcp:3000 tcp:3000`, rồi mở lại app                                                |
| Ads không load trên emulator                      | Bình thường; dùng device thật hoặc để trống App ID trên platform đó để dùng sample ads                                   |
| `run:ios` build OK nhưng Simulator không thấy app | Script cũ ghi `bootstatus` vào stdout làm hỏng UDID — cập nhật `run-ios-simulator.sh` mới nhất                           |
| Android vẫn thấy navigation bar (3 nút dưới)      | Chạy lại `npm run build:android` để apply `MainActivity` immersive mode từ `native/android/`                             |
| `android/` hoặc `ios/` mất sau clone              | Chạy `npm run build:android` / `npm run build:ios` — tự tạo lại platform                                                 |

---

## Native patches (tham khảo)

Scripts đọc `.env` và apply template từ `native/`:

| Script                  | Android                                                              | iOS                                                                  |
| ----------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------- |
| MainActivity            | `native/android/MainActivity.java` → `android/.../MainActivity.java` | —                                                                    |
| AdMob App ID            | `AndroidManifest.xml` meta-data                                      | `Info.plist` `GADApplicationIdentifier`                              |
| Fullscreen / status bar | —                                                                    | `native/ios/FullscreenBridgeViewController.swift`, `Main.storyboard` |
| CocoaPods pin           | —                                                                    | `GoogleUserMessagingPlatform 3.0.0` (pre-sync)                      |

Chi tiết build scripts: [Mobile Build](../setup/mobile-build.md).

---

## Related Documentation

- [Mobile Build](../setup/mobile-build.md) — Capacitor config, native patch flow
- [Environment Variables](../setup/environment-variables.md) — AdMob, API URL, IAP
- [Guest Identity](../modules/guest-identity.md) — flow cần API khi test online
