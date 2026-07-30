/**
 * Deeplink defaults for native apply scripts.
 * Keep in sync with `src/platform/modules/deep-link/deep-link.config.ts`.
 */

const DEEP_LINK_CONFIG = {
  scheme: 'gamestarterkit',
  hostProd: 'gamestarterkit.example.com',
  hostDev: 'dev.gamestarterkit.example.com',
};

export function resolveDeepLinkScheme() {
  return DEEP_LINK_CONFIG.scheme;
}

export function resolveDeepLinkHostDev() {
  return DEEP_LINK_CONFIG.hostDev;
}

export function resolveDeepLinkHostProd() {
  return DEEP_LINK_CONFIG.hostProd;
}

export function resolveDeepLinkHosts() {
  const hosts = [resolveDeepLinkHostDev(), resolveDeepLinkHostProd()];
  return [...new Set(hosts.filter(Boolean))];
}
