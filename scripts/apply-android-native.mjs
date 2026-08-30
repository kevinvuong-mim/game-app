import {
  isAdMobProvider,
  isGoogleTestAdId,
  isProductionAppEnv,
  GOOGLE_SAMPLE_ANDROID_APP_ID,
} from './admob-constants.mjs';
import {
  resolvePushNotificationsEnabled,
  resolveLocalNotificationsEnabled,
} from './notification-config.mjs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { loadEnvFile } from './env-file.mjs';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolveDeepLinkHosts, resolveDeepLinkScheme } from './deeplink-config.mjs';
import { readCapacitorAppId, resolveMainActivityPath } from './capacitor-config.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const FCM_DEFAULT_CHANNEL_ID = 'game_alerts';
const ANDROID_PERMISSIONS = [
  'android.permission.POST_NOTIFICATIONS',
  'android.permission.SCHEDULE_EXACT_ALARM',
  'android.permission.RECEIVE_BOOT_COMPLETED',
  'android.permission.VIBRATE',
];
const ADMOB_META_NAME = 'com.google.android.gms.ads.APPLICATION_ID';
const GOOGLE_SERVICES_PLUGIN = "apply plugin: 'com.google.gms.google-services'";
const GOOGLE_SERVICES_CLASSPATH = "classpath 'com.google.gms:google-services:4.4.2'";
const FCM_CHANNEL_META = 'com.google.firebase.messaging.default_notification_channel_id';

function resolveAdMobAppId() {
  const configured = process.env.VITE_ADMOB_ANDROID_APP_ID?.trim();
  if (configured) {
    if (isProductionAppEnv() && isGoogleTestAdId(configured)) {
      console.error(
        '[android-native] Production refuses Google sample AdMob app id in VITE_ADMOB_ANDROID_APP_ID'
      );
      process.exit(1);
    }
    return configured;
  }
  // Never inject Google sample ids into store / production packaging.
  if (isAdMobProvider() && !isProductionAppEnv()) {
    return GOOGLE_SAMPLE_ANDROID_APP_ID;
  }
  return '';
}

const ADMOB_BANNER_SKIP_INSETS =
  '// game-app: skip Android 15+ inset margin override (left-align + bottom gap).';

function endOfMatchingBrace(source, openBraceIndex) {
  let depth = 0;
  for (let i = openBraceIndex; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

function stripAndroid15InsetsOverride(source) {
  const marker = '// set Safe Area only for Android 15+';
  const start = source.indexOf(marker);
  if (start === -1) return source;

  const ifToken = 'if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.VANILLA_ICE_CREAM)';
  const ifPos = source.indexOf(ifToken, start);
  if (ifPos === -1) return source;

  const braceStart = source.indexOf('{', ifPos);
  if (braceStart === -1) return source;

  const braceEnd = endOfMatchingBrace(source, braceStart);
  if (braceEnd === -1) return source;

  let end = braceEnd;
  while (end < source.length && (source[end] === '\n' || source[end] === '\r')) {
    end += 1;
  }

  return `${source.slice(0, start)}${ADMOB_BANNER_SKIP_INSETS}\n\n${source.slice(end)}`;
}

function isAdMobBannerPatchComplete(source) {
  return (
    source.includes('Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL') &&
    source.includes(ADMOB_BANNER_SKIP_INSETS) &&
    !source.includes('setOnApplyWindowInsetsListener')
  );
}

/**
 * Upstream @capacitor-community/admob BannerExecutor on Android 15+:
 * 1) uses Gravity.BOTTOM without CENTER_HORIZONTAL → WRAP_CONTENT sticks left
 * 2) WindowInsets listener overwrites margins to (0,0,0,bottomInset) → left + bottom gap
 * Re-apply after every `cap sync` / `npm install` (plugin source lives in node_modules).
 */
function patchAdMobBannerExecutor() {
  const bannerPath = join(
    root,
    'node_modules/@capacitor-community/admob/android/src/main/java/com/getcapacitor/community/admob/banner/BannerExecutor.java'
  );

  if (!existsSync(bannerPath)) {
    console.warn('[android-native] AdMob BannerExecutor not found — skip banner position patch');
    return 'skipped';
  }

  let source = readFileSync(bannerPath, 'utf8');

  if (isAdMobBannerPatchComplete(source)) {
    return 'present';
  }

  const unpatchedGravity = `switch (adOptions.position) {
                case "TOP_CENTER":
                    mAdViewLayoutParams.gravity = Gravity.TOP;
                    break;
                case "CENTER":
                    mAdViewLayoutParams.gravity = Gravity.CENTER;
                    break;
                default:
                    mAdViewLayoutParams.gravity = Gravity.BOTTOM;
                    break;
            }`;

  const patchedGravity = `switch (adOptions.position) {
                case "TOP_CENTER":
                    mAdViewLayoutParams.gravity = Gravity.TOP | Gravity.CENTER_HORIZONTAL;
                    break;
                case "CENTER":
                    mAdViewLayoutParams.gravity = Gravity.CENTER;
                    break;
                default:
                    mAdViewLayoutParams.gravity = Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL;
                    break;
            }`;

  if (source.includes(unpatchedGravity)) {
    source = source.replace(unpatchedGravity, patchedGravity);
  } else if (!source.includes('Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL')) {
    console.warn('[android-native] AdMob BannerExecutor gravity block changed — patch manually');
    return 'failed';
  }

  source = stripAndroid15InsetsOverride(source);

  if (!isAdMobBannerPatchComplete(source)) {
    console.warn('[android-native] AdMob BannerExecutor insets block changed — patch manually');
    return 'failed';
  }

  writeFileSync(bannerPath, source);
  return 'patched';
}

function injectAdMobManifest(manifestPath, appId) {
  let manifest = readFileSync(manifestPath, 'utf8');

  if (manifest.includes(ADMOB_META_NAME)) {
    const updated = manifest.replace(
      new RegExp(
        `<meta-data\\s+android:name="${ADMOB_META_NAME}"\\s+android:value="[^"]*"\\s*/>`,
        's'
      ),
      `<meta-data android:name="${ADMOB_META_NAME}" android:value="${appId}" />`
    );

    if (updated !== manifest) {
      writeFileSync(manifestPath, updated);
      return 'updated';
    }

    return 'present';
  }

  manifest = manifest.replace(
    '</application>',
    `        <meta-data android:name="${ADMOB_META_NAME}" android:value="${appId}" />\n    </application>`
  );
  writeFileSync(manifestPath, manifest);
  return 'injected';
}

function injectNotificationPermissions(manifestPath) {
  let manifest = readFileSync(manifestPath, 'utf8');
  let changed = false;

  const permissionBlock = ANDROID_PERMISSIONS.map(
    (permission) => `    <uses-permission android:name="${permission}" />`
  ).join('\n');

  for (const permission of ANDROID_PERMISSIONS) {
    if (!manifest.includes(`android:name="${permission}"`)) {
      changed = true;
      break;
    }
  }

  if (changed) {
    manifest = manifest.replace(
      '    <uses-permission android:name="android.permission.INTERNET" />',
      `${permissionBlock}\n    <uses-permission android:name="android.permission.INTERNET" />`
    );
    writeFileSync(manifestPath, manifest);
  }

  return changed ? 'updated' : 'present';
}

function injectFcmChannelMetadata(manifestPath) {
  let manifest = readFileSync(manifestPath, 'utf8');

  if (manifest.includes(FCM_CHANNEL_META)) {
    return 'present';
  }

  manifest = manifest.replace(
    '</application>',
    `        <meta-data android:name="${FCM_CHANNEL_META}" android:value="${FCM_DEFAULT_CHANNEL_ID}" />\n    </application>`
  );
  writeFileSync(manifestPath, manifest);
  return 'updated';
}

function injectGoogleServicesClasspath(projectBuildGradlePath) {
  let content = readFileSync(projectBuildGradlePath, 'utf8');
  if (content.includes('com.google.gms:google-services')) {
    return 'present';
  }

  const updated = content.replace(
    /(buildscript\s*\{[\s\S]*?dependencies\s*\{[\s\S]*?classpath[^\n]+\n)/,
    `$1        ${GOOGLE_SERVICES_CLASSPATH}\n`
  );

  if (updated === content) {
    throw new Error(
      `[android-native] Could not inject Google Services classpath into ${projectBuildGradlePath}`
    );
  }

  writeFileSync(projectBuildGradlePath, updated);
  return 'injected';
}

function injectGoogleServicesAppPlugin(appBuildGradlePath) {
  let content = readFileSync(appBuildGradlePath, 'utf8');
  if (content.includes('com.google.gms.google-services')) {
    return 'present';
  }

  writeFileSync(appBuildGradlePath, `${content.trimEnd()}\n\n${GOOGLE_SERVICES_PLUGIN}\n`);
  return 'injected';
}

function injectGoogleServicesGradle() {
  const projectBuildGradlePath = join(root, 'android/build.gradle');
  const appBuildGradlePath = join(root, 'android/app/build.gradle');

  if (!existsSync(projectBuildGradlePath) || !existsSync(appBuildGradlePath)) {
    console.warn(
      '[android-native] Android Gradle files not found — skipping Google Services plugin'
    );
    return;
  }

  const classpathResult = injectGoogleServicesClasspath(projectBuildGradlePath);
  const pluginResult = injectGoogleServicesAppPlugin(appBuildGradlePath);
  console.log(`[android-native] Google Services classpath ${classpathResult}`);
  console.log(`[android-native] Google Services app plugin ${pluginResult}`);
}

function copyFirebaseAndroidConfig() {
  const source = join(root, 'native/firebase/google-services.json');
  const target = join(root, 'android/app/google-services.json');

  if (!existsSync(source)) {
    console.warn(
      '[android-native] Missing native/firebase/google-services.json — FCM push will not work until you add it'
    );
    return false;
  }

  writeFileSync(target, readFileSync(source, 'utf8'));
  console.log('[android-native] Copied google-services.json to android/app/');
  return true;
}

function injectDeepLinkIntentFilters(manifestPath, scheme, hosts) {
  const markerStart = '<!-- deeplink-intent-filters:start -->';
  const markerEnd = '<!-- deeplink-intent-filters:end -->';
  const hostData = hosts
    .map((host) => `<data android:scheme="https" android:host="${host}" />`)
    .join('\n                ');

  const block = `            ${markerStart}
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="${scheme}" />
            </intent-filter>
            <intent-filter android:autoVerify="true">
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                ${hostData}
            </intent-filter>
            ${markerEnd}`;

  let manifest = readFileSync(manifestPath, 'utf8');
  const blockRegex =
    /<!-- deeplink-intent-filters:start -->[\s\S]*?<!-- deeplink-intent-filters:end -->/;

  if (blockRegex.test(manifest)) {
    manifest = manifest.replace(blockRegex, block.trim());
  } else {
    manifest = manifest.replace('        </activity>', `${block}\n        </activity>`);
  }

  writeFileSync(manifestPath, manifest);
  return 'updated';
}

function applyMainActivityTemplate(appId) {
  const templatePath = join(root, 'native/android/MainActivity.java');
  const targetPath = resolveMainActivityPath(root, appId);

  if (!existsSync(templatePath)) {
    console.warn('[android-native] MainActivity template not found');
    return;
  }

  if (!existsSync(join(root, 'android'))) {
    console.warn('[android-native] Android project not found — run `npx cap add android` first');
    return;
  }

  const source = readFileSync(templatePath, 'utf8');
  const packageLine = `package ${appId};`;
  const activity = source.replace(/^package\s+[^;]+;/m, packageLine);

  mkdirSync(dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, activity);
  console.log(`[android-native] Applied MainActivity template → ${targetPath}`);
}

loadEnvFile(root);

const appId = readCapacitorAppId(root);
const manifestPath = join(root, 'android/app/src/main/AndroidManifest.xml');

applyMainActivityTemplate(appId);

const bannerPatchResult = patchAdMobBannerExecutor();
console.log(`[android-native] AdMob banner position patch ${bannerPatchResult}`);

if (isProductionAppEnv() && bannerPatchResult === 'failed') {
  console.error(
    '[android-native] AdMob BannerExecutor patch failed on production — refuse to ship misaligned banners'
  );
  process.exit(1);
}

if (isProductionAppEnv() && isAdMobProvider() && bannerPatchResult === 'skipped') {
  console.error(
    '[android-native] AdMob BannerExecutor missing on production admob build — run npm install / cap sync'
  );
  process.exit(1);
}

const adsProvider = process.env.VITE_ADS_PROVIDER ?? 'mock';
const admobAppId = resolveAdMobAppId();

if (adsProvider === 'admob') {
  if (!existsSync(manifestPath)) {
    console.error('[android-native] AndroidManifest.xml not found — cannot inject AdMob App ID');
    process.exit(1);
  }

  if (!admobAppId) {
    console.error('[android-native] VITE_ADS_PROVIDER=admob requires VITE_ADMOB_ANDROID_APP_ID');
    process.exit(1);
  }

  const result = injectAdMobManifest(manifestPath, admobAppId);
  console.log(`[android-native] AdMob APPLICATION_ID ${result}: ${admobAppId}`);
}

const pushEnabled = resolvePushNotificationsEnabled();
const localEnabled = resolveLocalNotificationsEnabled();

if ((pushEnabled || localEnabled) && existsSync(manifestPath)) {
  const permissionsResult = injectNotificationPermissions(manifestPath);
  console.log(`[android-native] Notification permissions ${permissionsResult}`);
}

if (pushEnabled && existsSync(manifestPath)) {
  const channelResult = injectFcmChannelMetadata(manifestPath);
  console.log(`[android-native] FCM notification channel ${channelResult}`);
  copyFirebaseAndroidConfig();
  injectGoogleServicesGradle();
}

if (existsSync(manifestPath)) {
  const deeplinkResult = injectDeepLinkIntentFilters(
    manifestPath,
    resolveDeepLinkScheme(),
    resolveDeepLinkHosts()
  );
  console.log(`[android-native] Deeplink intent filters ${deeplinkResult}`);
}
