import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { resolvePushNotificationsEnabled } from './notification-config.mjs';
import { resolveDeepLinkHosts, resolveDeepLinkScheme } from './deeplink-config.mjs';
import { rmSync, existsSync, unlinkSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const ENTITLEMENTS_FILE = 'App.entitlements';
const SWIFT_FILE_REF_ID = 'F5LL5CRN1FED79650016851F';
const ENTITLEMENTS_REF_ID = 'F5LL5CRN3FED79650016851F';
const SWIFT_BUILD_FILE_ID = 'F5LL5CRN2FED79650016851F';
const SWIFT_FILE = 'FullscreenBridgeViewController.swift';
const GOOGLE_SERVICE_INFO_FILE = 'GoogleService-Info.plist';
const GOOGLE_SERVICE_INFO_REF_ID = 'F5LL5CRN4FED79650016851F';
const GOOGLE_SERVICE_INFO_BUILD_FILE_ID = 'F5LL5CRN5FED79650016851F';
const GOOGLE_SAMPLE_IOS_APP_ID = 'ca-app-pub-3940256099942544~1458002511';
const ENTITLEMENTS_BUILD_SETTING = 'CODE_SIGN_ENTITLEMENTS = App/App.entitlements;';

function loadEnvFile(name) {
  const envPath = join(root, name);
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
    if (!(key in process.env)) process.env[key] = value;
  }
}

function resolveAdMobAppId() {
  const configured = process.env.VITE_ADMOB_IOS_APP_ID?.trim();
  if (configured) return configured;
  if (process.env.VITE_ADS_PROVIDER === 'admob') return GOOGLE_SAMPLE_IOS_APP_ID;
  return '';
}

function pushNotificationsEnabled() {
  return resolvePushNotificationsEnabled();
}

function resetIosPods(podDir) {
  const podfileLockPath = join(podDir, 'Podfile.lock');
  const podsDir = join(podDir, 'Pods');
  const manifestPath = join(podsDir, 'Manifest.lock');

  if (existsSync(podfileLockPath)) {
    unlinkSync(podfileLockPath);
    console.log('[ios-native] Cleared Podfile.lock for fresh pod resolve');
  }

  if (existsSync(manifestPath)) {
    unlinkSync(manifestPath);
  }

  if (existsSync(podsDir)) {
    rmSync(podsDir, { recursive: true, force: true });
    console.log('[ios-native] Cleared Pods/ for fresh pod resolve');
  }
}

function patchPodfile(podfilePath) {
  if (!existsSync(podfilePath)) return false;
  let content = readFileSync(podfilePath, 'utf8');
  let changed = false;

  if (!content.includes("pod 'GoogleUserMessagingPlatform'")) {
    content = content.replace(
      /(target 'App' do\n(?:.*\n)*? {2}# Add your Pods here\n)/,
      `$1  pod 'GoogleUserMessagingPlatform', '3.0.0'\n`
    );
    changed = true;
    console.log('[ios-native] Pinned GoogleUserMessagingPlatform 3.0.0 in Podfile');
  } else if (content.includes("pod 'GoogleUserMessagingPlatform', '~> 2.3'")) {
    content = content.replace(
      "pod 'GoogleUserMessagingPlatform', '~> 2.3'",
      "pod 'GoogleUserMessagingPlatform', '3.0.0'"
    );
    changed = true;
    console.log('[ios-native] Upgraded GoogleUserMessagingPlatform pin to 3.0.0');
  }

  if (pushNotificationsEnabled() && !content.includes("pod 'FirebaseMessaging'")) {
    content = content.replace(
      /(target 'App' do\n(?:.*\n)*? {2}# Add your Pods here\n(?:.*\n)*?)/,
      `$1  pod 'FirebaseMessaging'\n`
    );
    changed = true;
    console.log('[ios-native] Added FirebaseMessaging pod');
  }

  if (changed) {
    writeFileSync(podfilePath, content);
  }

  return changed;
}

function patchNotificationPlist(plistPath) {
  let content = readFileSync(plistPath, 'utf8');
  let changed = false;

  if (!content.includes('UIBackgroundModes')) {
    content = content.replace(
      '</dict>\n</plist>',
      '\t<key>UIBackgroundModes</key>\n\t<array>\n\t\t<string>remote-notification</string>\n\t</array>\n</dict>\n</plist>'
    );
    changed = true;
  }

  if (!content.includes('FirebaseAppDelegateProxyEnabled')) {
    content = content.replace(
      '</dict>\n</plist>',
      '\t<key>FirebaseAppDelegateProxyEnabled</key>\n\t<true/>\n</dict>\n</plist>'
    );
    changed = true;
  }

  if (changed) {
    writeFileSync(plistPath, content);
    console.log('[ios-native] Applied push notification Info.plist keys');
  }
}

function patchAdMobPlist(plistPath, appId) {
  let content = readFileSync(plistPath, 'utf8');

  if (content.includes('GADApplicationIdentifier')) {
    const updated = content.replace(
      /<key>GADApplicationIdentifier<\/key>\s*<string>[^<]*<\/string>/,
      `<key>GADApplicationIdentifier</key>\n\t<string>${appId}</string>`
    );
    if (updated !== content) {
      writeFileSync(plistPath, updated);
      return 'updated';
    }
    return 'present';
  }

  const snippet =
    `\t<key>GADApplicationIdentifier</key>\n\t<string>${appId}</string>\n` +
    `\t<key>NSUserTrackingUsageDescription</key>\n` +
    `\t<string>This identifier will be used to deliver personalized ads to you.</string>\n` +
    `\t<key>SKAdNetworkItems</key>\n\t<array>\n\t\t<dict>\n` +
    `\t\t\t<key>SKAdNetworkIdentifier</key>\n\t\t\t<string>cstr6suwn9.skadnetwork</string>\n` +
    `\t\t</dict>\n\t</array>\n`;

  content = content.replace('</dict>\n</plist>', `${snippet}</dict>\n</plist>`);
  writeFileSync(plistPath, content);
  return 'injected';
}

function patchDeepLinkInfoPlist(plistPath, scheme) {
  let content = readFileSync(plistPath, 'utf8');
  const marker = '<!-- deeplink-url-schemes -->';

  if (content.includes('CFBundleURLTypes') && content.includes(scheme)) {
    return 'present';
  }

  const snippet =
    `\t<key>CFBundleURLTypes</key>\n` +
    `\t<array>\n` +
    `\t\t<dict>\n` +
    `\t\t\t<key>CFBundleURLName</key>\n` +
    `\t\t\t<string>${scheme}</string>\n` +
    `\t\t\t<key>CFBundleURLSchemes</key>\n` +
    `\t\t\t<array>\n` +
    `\t\t\t\t<string>${scheme}</string>\n` +
    `\t\t\t</array>\n` +
    `\t\t</dict>\n` +
    `\t</array>\n`;

  if (!content.includes('CFBundleURLTypes')) {
    content = content.replace('</dict>\n</plist>', `${snippet}</dict>\n</plist>`);
    writeFileSync(plistPath, content);
    return 'injected';
  }

  return 'present';
}

function stripApsEnvironment(entitlementsPath) {
  if (!existsSync(entitlementsPath)) return;
  let content = readFileSync(entitlementsPath, 'utf8');
  const updated = content.replace(
    /\t<key>aps-environment<\/key>\s*\n\t<string>[^<]*<\/string>\s*\n/,
    ''
  );
  if (updated !== content) {
    writeFileSync(entitlementsPath, updated);
  }
}

function patchDeepLinkEntitlements(entitlementsPath, hosts) {
  const entries = hosts.map((host) => `\t\t<string>applinks:${host}</string>`).join('\n');
  const snippet =
    `\t<key>com.apple.developer.associated-domains</key>\n` + `\t<array>\n${entries}\n\t</array>\n`;

  if (!existsSync(entitlementsPath)) {
    const content =
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n` +
      `<plist version="1.0">\n<dict>\n${snippet}</dict>\n</plist>\n`;
    writeFileSync(entitlementsPath, content);
    return 'created';
  }

  let content = readFileSync(entitlementsPath, 'utf8');

  if (content.includes('com.apple.developer.associated-domains')) {
    const updated = content.replace(
      /\t*<key>com\.apple\.developer\.associated-domains<\/key>\s*<array>[\s\S]*?<\/array>/,
      snippet.trimEnd()
    );
    if (updated !== content) {
      writeFileSync(entitlementsPath, updated);
      return 'updated';
    }
    return 'present';
  }

  content = content.replace('</dict>\n</plist>', `${snippet}</dict>\n</plist>`);
  writeFileSync(entitlementsPath, content);
  return 'injected';
}

function patchPbxproj(projectPath) {
  let content = readFileSync(projectPath, 'utf8');
  let changed = false;

  if (!content.includes(SWIFT_FILE)) {
    content = content.replace(
      '504EC3081FED79650016851F /* AppDelegate.swift in Sources */ = {isa = PBXBuildFile; fileRef = 504EC3071FED79650016851F /* AppDelegate.swift */; };',
      `504EC3081FED79650016851F /* AppDelegate.swift in Sources */ = {isa = PBXBuildFile; fileRef = 504EC3071FED79650016851F /* AppDelegate.swift */; };
\t\t${SWIFT_BUILD_FILE_ID} /* ${SWIFT_FILE} in Sources */ = {isa = PBXBuildFile; fileRef = ${SWIFT_FILE_REF_ID} /* ${SWIFT_FILE} */; };`
    );

    content = content.replace(
      '504EC3071FED79650016851F /* AppDelegate.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = AppDelegate.swift; sourceTree = "<group>"; };',
      `504EC3071FED79650016851F /* AppDelegate.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = AppDelegate.swift; sourceTree = "<group>"; };
\t\t${SWIFT_FILE_REF_ID} /* ${SWIFT_FILE} */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = ${SWIFT_FILE}; sourceTree = "<group>"; };`
    );

    content = content.replace(
      '504EC3071FED79650016851F /* AppDelegate.swift */,',
      `504EC3071FED79650016851F /* AppDelegate.swift */,
\t\t\t\t${SWIFT_FILE_REF_ID} /* ${SWIFT_FILE} */,`
    );

    content = content.replace(
      '504EC3081FED79650016851F /* AppDelegate.swift in Sources */,',
      `504EC3081FED79650016851F /* AppDelegate.swift in Sources */,
\t\t\t\t${SWIFT_BUILD_FILE_ID} /* ${SWIFT_FILE} in Sources */,`
    );

    changed = true;
    console.log('[ios-native] Registered FullscreenBridgeViewController in Xcode project');
  }

  // Associated Domains (Universal Links) need entitlements even when push is off.
  if (!content.includes(ENTITLEMENTS_FILE)) {
    content = content.replace(
      '504EC3071FED79650016851F /* AppDelegate.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = AppDelegate.swift; sourceTree = "<group>"; };',
      `504EC3071FED79650016851F /* AppDelegate.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = AppDelegate.swift; sourceTree = "<group>"; };
\t\t${ENTITLEMENTS_REF_ID} /* ${ENTITLEMENTS_FILE} */ = {isa = PBXFileReference; lastKnownFileType = text.plist.entitlements; path = ${ENTITLEMENTS_FILE}; sourceTree = "<group>"; };`
    );

    content = content.replace(
      '504EC3071FED79650016851F /* AppDelegate.swift */,',
      `504EC3071FED79650016851F /* AppDelegate.swift */,
\t\t\t\t${ENTITLEMENTS_REF_ID} /* ${ENTITLEMENTS_FILE} */,`
    );

    if (!content.includes(ENTITLEMENTS_BUILD_SETTING)) {
      content = content.replace(
        /CODE_SIGN_STYLE = Automatic;\n/g,
        `CODE_SIGN_STYLE = Automatic;\n\t\t\t\t${ENTITLEMENTS_BUILD_SETTING}\n`
      );
    }

    changed = true;
    console.log('[ios-native] Registered App.entitlements in Xcode project');
  }

  if (
    pushNotificationsEnabled() &&
    existsSync(join(root, 'native/firebase', GOOGLE_SERVICE_INFO_FILE)) &&
    !content.includes(GOOGLE_SERVICE_INFO_FILE)
  ) {
    content = content.replace(
      '504EC30F1FED79650016851F /* Assets.xcassets in Resources */ = {isa = PBXBuildFile; fileRef = 504EC30E1FED79650016851F /* Assets.xcassets */; };',
      `504EC30F1FED79650016851F /* Assets.xcassets in Resources */ = {isa = PBXBuildFile; fileRef = 504EC30E1FED79650016851F /* Assets.xcassets */; };
\t\t${GOOGLE_SERVICE_INFO_BUILD_FILE_ID} /* ${GOOGLE_SERVICE_INFO_FILE} in Resources */ = {isa = PBXBuildFile; fileRef = ${GOOGLE_SERVICE_INFO_REF_ID} /* ${GOOGLE_SERVICE_INFO_FILE} */; };`
    );

    content = content.replace(
      '504EC3131FED79650016851F /* Info.plist */ = {isa = PBXFileReference; lastKnownFileType = text.plist.xml; path = Info.plist; sourceTree = "<group>"; };',
      `504EC3131FED79650016851F /* Info.plist */ = {isa = PBXFileReference; lastKnownFileType = text.plist.xml; path = Info.plist; sourceTree = "<group>"; };
\t\t${GOOGLE_SERVICE_INFO_REF_ID} /* ${GOOGLE_SERVICE_INFO_FILE} */ = {isa = PBXFileReference; fileEncoding = 4; lastKnownFileType = text.plist.xml; path = ${GOOGLE_SERVICE_INFO_FILE}; sourceTree = "<group>"; };`
    );

    content = content.replace(
      '504EC3131FED79650016851F /* Info.plist */,',
      `504EC3131FED79650016851F /* Info.plist */,
\t\t\t\t${GOOGLE_SERVICE_INFO_REF_ID} /* ${GOOGLE_SERVICE_INFO_FILE} */,`
    );

    content = content.replace(
      '504EC30F1FED79650016851F /* Assets.xcassets in Resources */,',
      `504EC30F1FED79650016851F /* Assets.xcassets in Resources */,
\t\t\t\t${GOOGLE_SERVICE_INFO_BUILD_FILE_ID} /* ${GOOGLE_SERVICE_INFO_FILE} in Resources */,`
    );

    changed = true;
    console.log('[ios-native] Registered GoogleService-Info.plist in Xcode Copy Bundle Resources');
  }

  if (changed) {
    writeFileSync(projectPath, content);
  }
}

function copyFirebaseIosConfig(iosAppDir) {
  const source = join(root, 'native/firebase', GOOGLE_SERVICE_INFO_FILE);
  const target = join(iosAppDir, GOOGLE_SERVICE_INFO_FILE);

  if (!existsSync(source)) {
    console.warn(
      `[ios-native] Missing native/firebase/${GOOGLE_SERVICE_INFO_FILE} — FCM push will not work until you add it`
    );
    return false;
  }

  copyFileSync(source, target);
  console.log(`[ios-native] Copied ${GOOGLE_SERVICE_INFO_FILE} to ios/App/App/`);
  return true;
}

loadEnvFile('.env');

const mode = process.argv[2] ?? 'post-sync';
const iosAppDir = join(root, 'ios/App/App');
const iosProject = join(root, 'ios/App/App.xcodeproj/project.pbxproj');
const nativeDir = join(root, 'native/ios');
const plistPath = join(iosAppDir, 'Info.plist');
const podDir = join(root, 'ios/App');
const podfilePath = join(podDir, 'Podfile');
const podfileLockPath = join(podDir, 'Podfile.lock');

if (!existsSync(iosAppDir)) {
  console.warn('[ios-native] iOS project not found — run `npx cap add ios` first');
  process.exit(0);
}

if (mode === 'pre-sync') {
  const podfileChanged = patchPodfile(podfilePath);
  if (podfileChanged) {
    resetIosPods(podDir);
  }
  process.exit(0);
}

if (existsSync(nativeDir)) {
  const swiftTemplate = join(nativeDir, SWIFT_FILE);
  const storyboardTemplate = join(nativeDir, 'Main.storyboard');
  const appDelegateTemplate = join(nativeDir, 'AppDelegate.swift');
  const entitlementsTemplate = join(nativeDir, ENTITLEMENTS_FILE);

  if (existsSync(swiftTemplate)) {
    copyFileSync(swiftTemplate, join(iosAppDir, SWIFT_FILE));
  }
  if (existsSync(storyboardTemplate)) {
    copyFileSync(storyboardTemplate, join(iosAppDir, 'Base.lproj/Main.storyboard'));
  }
  if (pushNotificationsEnabled() && existsSync(appDelegateTemplate)) {
    copyFileSync(appDelegateTemplate, join(iosAppDir, 'AppDelegate.swift'));
    console.log('[ios-native] Applied Firebase AppDelegate template');
  }
  // Always apply entitlements for Universal Links (associated domains).
  if (existsSync(entitlementsTemplate)) {
    copyFileSync(entitlementsTemplate, join(iosAppDir, ENTITLEMENTS_FILE));
    console.log('[ios-native] Applied App.entitlements template');
    if (!pushNotificationsEnabled()) {
      stripApsEnvironment(join(iosAppDir, ENTITLEMENTS_FILE));
    }
  }
  if (existsSync(iosProject)) {
    patchPbxproj(iosProject);
  }
} else {
  console.warn('[ios-native] native/ios templates not found — skipping fullscreen storyboard copy');
}

if (pushNotificationsEnabled()) {
  patchNotificationPlist(plistPath);
  copyFirebaseIosConfig(iosAppDir);
}

const adsProvider = process.env.VITE_ADS_PROVIDER ?? 'mock';
const admobAppId = resolveAdMobAppId();

if (adsProvider === 'admob') {
  if (!admobAppId) {
    console.error('[ios-native] VITE_ADS_PROVIDER=admob requires VITE_ADMOB_IOS_APP_ID');
    process.exit(1);
  }

  const result = patchAdMobPlist(plistPath, admobAppId);
  console.log(`[ios-native] AdMob GADApplicationIdentifier ${result}: ${admobAppId}`);
} else if (admobAppId) {
  const result = patchAdMobPlist(plistPath, admobAppId);
  console.log(`[ios-native] AdMob GADApplicationIdentifier ${result}: ${admobAppId}`);
}

const deeplinkScheme = resolveDeepLinkScheme();
const deeplinkHosts = resolveDeepLinkHosts();
const deeplinkPlistResult = patchDeepLinkInfoPlist(plistPath, deeplinkScheme);
console.log(`[ios-native] Deeplink URL scheme ${deeplinkPlistResult}: ${deeplinkScheme}`);

const entitlementsPath = join(iosAppDir, ENTITLEMENTS_FILE);
const deeplinkEntitlementsResult = patchDeepLinkEntitlements(entitlementsPath, deeplinkHosts);
console.log(`[ios-native] Associated domains ${deeplinkEntitlementsResult}`);

console.log('[ios-native] Applied iOS native config');
