import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const NOTIFICATION_ENV_CONFIGS = JSON.parse(
  readFileSync(join(root, 'src/platform/core/config/notification-env.json'), 'utf8')
);

const FIREBASE_ENV_KEYS = [
  'VITE_FIREBASE_APP_ID',
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_MEASUREMENT_ID',
];

function resolveEnvironment() {
  const env = process.env.VITE_APP_ENV;
  if (env && env in NOTIFICATION_ENV_CONFIGS) return env;
  return process.env.NODE_ENV === 'production' ? 'production' : 'dev';
}

function isFirebaseConfigured(env = process.env) {
  return FIREBASE_ENV_KEYS.every((key) => Boolean(env[key]?.trim()));
}

export function resolvePushNotificationsEnabled(env = process.env) {
  const appEnv = resolveEnvironment();
  const baseEnabled = NOTIFICATION_ENV_CONFIGS[appEnv].pushNotificationsEnabled;
  if (!baseEnabled) return false;
  return isFirebaseConfigured(env);
}

export function resolveLocalNotificationsEnabled() {
  const appEnv = resolveEnvironment();
  return NOTIFICATION_ENV_CONFIGS[appEnv].localNotificationsEnabled;
}
