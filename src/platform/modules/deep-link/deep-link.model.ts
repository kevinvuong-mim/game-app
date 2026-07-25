const DEEP_LINK_ROUTES = {
  HOME: 'Home',
  SHOP: 'Shop',
  LEGAL: 'Legal',
  GAMEPLAY: 'Gameplay',
  MISSIONS: 'Missions',
  SETTINGS: 'Settings',
  LEADERBOARD: 'Leaderboard',
  DAILY_REWARD: 'DailyReward',
} as const;

export type DeepLinkRoute = (typeof DEEP_LINK_ROUTES)[keyof typeof DEEP_LINK_ROUTES];

export type DeepLinkSource = 'web' | 'cold_start' | 'app_url_open';

export interface DeepLinkPayload {
  url: string;
  path: string;
  scene: DeepLinkRoute;
  source: DeepLinkSource;
  params: Record<string, string>;
}

const PATH_TO_SCENE: Record<string, DeepLinkRoute> = {
  '/': DEEP_LINK_ROUTES.HOME,
  '/home': DEEP_LINK_ROUTES.HOME,
  '/shop': DEEP_LINK_ROUTES.SHOP,
  '/legal': DEEP_LINK_ROUTES.LEGAL,
  '/play': DEEP_LINK_ROUTES.GAMEPLAY,
  '/gameplay': DEEP_LINK_ROUTES.GAMEPLAY,
  '/missions': DEEP_LINK_ROUTES.MISSIONS,
  '/settings': DEEP_LINK_ROUTES.SETTINGS,
  '/leaderboard': DEEP_LINK_ROUTES.LEADERBOARD,
  '/daily-reward': DEEP_LINK_ROUTES.DAILY_REWARD,
};

export function resolveDeepLinkScene(path: string): DeepLinkRoute | null {
  const normalized = normalizeDeepLinkPath(path);
  return PATH_TO_SCENE[normalized] ?? null;
}

export function normalizeDeepLinkPath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed || trimmed === '/') {
    return '/';
  }

  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withLeadingSlash.replace(/\/+$/, '').toLowerCase() || '/';
}

export function buildDeepLinkSceneData(payload: DeepLinkPayload): Record<string, unknown> {
  return {
    returnTo: 'Home',
    deepLink: {
      url: payload.url,
      path: payload.path,
      source: payload.source,
      params: payload.params,
    },
  };
}
