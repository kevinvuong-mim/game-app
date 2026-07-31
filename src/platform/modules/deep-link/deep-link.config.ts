import type { Environment } from '@platform/core/config';

export interface DeepLinkConfig {
  host: string;
  scheme: string;
  allowedHosts: string[];
}

/** Edit these when cloning a game — keep in sync with `scripts/deeplink-config.mjs`. */
const DEEP_LINK_CONFIG = {
  scheme: 'fruloop',
  hostProd: 'fruloop.vraxion.com',
  hostDev: 'dev-fruloop.vraxion.com',
};

function resolveEnvironment(): Environment {
  const env = import.meta.env.VITE_APP_ENV as Environment | undefined;
  if (env === 'dev' || env === 'production') {
    return env;
  }
  return import.meta.env.PROD ? 'production' : 'dev';
}

function resolveHost(environment: Environment): string {
  if (environment === 'production') return DEEP_LINK_CONFIG.hostProd;
  return DEEP_LINK_CONFIG.hostDev;
}

export function resolveDeepLinkConfig(): DeepLinkConfig {
  const environment = resolveEnvironment();

  return {
    host: resolveHost(environment),
    scheme: DEEP_LINK_CONFIG.scheme,
    allowedHosts: [
      ...new Set([DEEP_LINK_CONFIG.hostDev, DEEP_LINK_CONFIG.hostProd].filter(Boolean)),
    ],
  };
}
