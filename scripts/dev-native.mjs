import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const platform = process.argv[2];

if (platform !== 'android' && platform !== 'ios') {
  console.error('[dev:native] Usage: node scripts/dev-native.mjs <android|ios>');
  process.exit(1);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const defaultUrl = 'http://localhost:5173';
const liveReloadUrl = process.env.CAP_SERVER_URL || defaultUrl;

let parsedUrl;
try {
  parsedUrl = new URL(liveReloadUrl);
} catch {
  console.error(`[dev:native] Invalid CAP_SERVER_URL: ${liveReloadUrl}`);
  process.exit(1);
}

if (parsedUrl.protocol !== 'http:') {
  console.error('[dev:native] CAP_SERVER_URL must use http:// with the local Vite server');
  process.exit(1);
}

const port = parsedUrl.port || '80';
const localServerUrl = `http://127.0.0.1:${port}`;
let viteProcess;
let nativeProcess;

function log(message) {
  console.log(`[dev:native] ${message}`);
}

function setupAndroidPortReverse(currentPort) {
  if (platform !== 'android') return;

  try {
    execFileSync('adb', ['reverse', `tcp:${currentPort}`, `tcp:${currentPort}`], {
      stdio: 'ignore',
    });
    log(`Configured adb reverse tcp:${currentPort} -> tcp:${currentPort}`);
  } catch {
    log(
      `Could not configure adb reverse for port ${currentPort}. ` +
        'If running on a physical device, set CAP_SERVER_URL to your LAN IP.'
    );
  }
}

async function serverIsReady() {
  try {
    const response = await fetch(localServerUrl);
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForServer(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (await serverIsReady()) {
      return;
    }
    if (viteProcess?.exitCode !== null) {
      throw new Error(`Vite exited with code ${viteProcess.exitCode}`);
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }

  throw new Error(`Vite did not start at ${localServerUrl} within ${timeoutMs / 1000}s`);
}

function stopChildren() {
  nativeProcess?.kill('SIGTERM');
  viteProcess?.kill('SIGTERM');
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    stopChildren();
    process.exit(0);
  });
}

async function main() {
  setupAndroidPortReverse(port);

  if (await serverIsReady()) {
    log(`Reusing the dev server at ${localServerUrl}`);
  } else {
    log(`Starting Vite on port ${port}`);
    viteProcess = spawn('npm', ['run', 'dev', '--', '--port', port, '--strictPort'], {
      cwd: root,
      env: process.env,
      stdio: 'inherit',
    });
    await waitForServer();
  }

  log(`Live reload URL: ${liveReloadUrl}`);
  log(`Building and launching ${platform} once; subsequent web changes reload automatically`);

  nativeProcess = spawn('npm', ['run', `run:${platform}`], {
    cwd: root,
    env: {
      ...process.env,
      CAP_SERVER_URL: liveReloadUrl,
    },
    stdio: 'inherit',
  });

  const exitCode = await new Promise((resolveExit) => {
    nativeProcess.once('exit', (code) => resolveExit(code ?? 1));
  });
  nativeProcess = undefined;

  if (exitCode !== 0) {
    throw new Error(`Native launch failed with code ${exitCode}`);
  }

  log('Live reload is active. Press Ctrl+C to stop the dev server.');
  await new Promise(() => {});
}

main().catch((error) => {
  stopChildren();
  console.error(`[dev:native] ERROR: ${error.message}`);
  process.exit(1);
});
