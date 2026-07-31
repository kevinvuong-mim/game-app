import { join } from 'node:path';
import { readFileSync } from 'node:fs';

/**
 * Read appId from capacitor.config.ts (supports appId: '…' or appId: "…").
 */
export function readCapacitorAppId(root) {
  const configPath = join(root, 'capacitor.config.ts');
  const content = readFileSync(configPath, 'utf8');
  const match = content.match(/appId:\s*['"]([^'"]+)['"]/);
  if (!match) {
    throw new Error(`[capacitor-config] Could not read appId from ${configPath}`);
  }
  return match[1];
}

function appIdToJavaPackagePath(appId) {
  return appId.replace(/\./g, '/');
}

export function resolveMainActivityPath(root, appId = readCapacitorAppId(root)) {
  return join(
    root,
    'android/app/src/main/java',
    appIdToJavaPackagePath(appId),
    'MainActivity.java'
  );
}
