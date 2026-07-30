import type { Environment } from '@platform/core/config';

export interface DeepLinkConfig {
  host: string;
  scheme: string;
  allowedHosts: string[];
}

const DEFAULT_SCHEME = 'gamestarterkit';
const DEFAULT_HOST_PROD = 'gamestarterkit.example.com';
const DEFAULT_HOST_DEV = 'dev.gamestarterkit.example.com';

function resolveEnvironment(): Environment {
  const env = import.meta.env.VITE_APP_ENV as Environment | undefined;
  if (env === 'dev' || env === 'production') {
    return env;
  }
  return import.meta.env.PROD ? 'production' : 'dev';
}

export function resolveDeepLinkConfig(): DeepLinkConfig {
  const hostDev = import.meta.env.VITE_DEEPLINK_HOST_DEV ?? DEFAULT_HOST_DEV;
  const hostProd = import.meta.env.VITE_DEEPLINK_HOST_PROD ?? DEFAULT_HOST_PROD;

  const environment = resolveEnvironment();
  const host = environment === 'production' ? hostProd : hostDev;

  return {
    host,
    scheme: import.meta.env.VITE_DEEPLINK_SCHEME ?? DEFAULT_SCHEME,
    allowedHosts: [...new Set([hostDev, hostProd].filter(Boolean))],
  };
}
