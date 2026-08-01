import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const [, , action, platform] = process.argv;

function fail(message) {
  console.error(`[native-ops] ERROR: ${message}`);
  process.exit(1);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runInDir(directory, command, args) {
  run(command, args, { cwd: directory });
}

function ensureCapPlatform(targetPlatform) {
  if (targetPlatform === 'android') {
    if (!existsSync('android')) {
      run('cap', ['add', 'android']);
    }
    return;
  }

  if (targetPlatform === 'ios') {
    if (!existsSync('ios')) {
      run('cap', ['add', 'ios']);
    }
    return;
  }

  fail(`Unsupported platform: ${targetPlatform}`);
}

function resolveIosPods() {
  const iosAppDir = join(process.cwd(), 'ios/App');
  if (!existsSync(join(iosAppDir, 'Podfile'))) {
    return;
  }

  console.log('[native-ops] Resolving iOS pods with repo update...');
  runInDir(iosAppDir, 'pod', ['install', '--repo-update']);
}

function build(targetPlatform) {
  // Fail fast when packaging a production store build with mock IAP/ads.
  run('npm', ['run', 'game:verify-config']);
  run('npm', ['run', 'build']);
  ensureCapPlatform(targetPlatform);
  run('npm', ['run', 'assets:generate']);

  if (targetPlatform === 'android') {
    run('cap', ['sync', 'android']);
    run('node', ['scripts/apply-android-native.mjs']);
    return;
  }

  if (targetPlatform === 'ios') {
    run('node', ['scripts/apply-ios-native.mjs', 'pre-sync']);
    resolveIosPods();
    run('cap', ['sync', 'ios']);
    run('node', ['scripts/apply-ios-native.mjs']);
    return;
  }

  fail(`Unsupported platform: ${targetPlatform}`);
}

if (action === 'build') {
  build(platform);
} else {
  fail(`Unsupported action: ${action}`);
}
