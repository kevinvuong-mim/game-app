/**
 * Deeplink defaults for native apply scripts.
 * Keep in sync with `src/platform/modules/deep-link/deep-link.config.ts`.
 */

const DEEP_LINK_CONFIG = {
  scheme: 'memora',
  hostProd: 'memora.vraxion.com',
  hostDev: 'dev-memora.vraxion.com',
};

export function resolveDeepLinkScheme() {
  return DEEP_LINK_CONFIG.scheme;
}

export function resolveDeepLinkHosts() {
  return [...new Set([DEEP_LINK_CONFIG.hostDev, DEEP_LINK_CONFIG.hostProd].filter(Boolean))];
}
