# Fruloop

Fruloop is a mobile game that allows you to play with your friends and family.

## Tech Stack

| Layer       | Technology                                                                                               |
| ----------- | -------------------------------------------------------------------------------------------------------- |
| Game Engine | Phaser 3                                                                                                 |
| Mobile      | Capacitor 7                                                                                              |
| Language    | TypeScript (strict)                                                                                      |
| Bundler     | Vite 6                                                                                                   |
| State       | Zustand (vanilla, in-memory)                                                                             |
| Storage     | IndexedDB (web) / Capacitor Preferences (native)                                                         |
| Networking  | Fetch API (NestJS-compatible REST envelope)                                                              |
| Analytics   | Console or Firebase via `VITE_ANALYTICS_PROVIDER` (gated by `analyticsEnabled`)                          |
| Push        | FCM via `@capacitor/push-notifications` (native; gated by `notification-env.json` + Firebase web config) |
| Local notif | `@capacitor/local-notifications` (daily reward reminder)                                                 |
| Ads         | Mock (web/dev) + AdMob via `@capacitor-community/admob` (native)                                         |

IAP / remove-ads entitlements are client-authoritative in this starter kit. RevenueCat can verify purchases on device, but `game-api` does not store or validate entitlements server-side.

**Node.js:** `>= 20`

## Quick Start

```bash
npm install
cp .env.example .env
npm run dev
```

Open `http://localhost:5173`.

## Create a New Game

**Clone this entire repo** for each new game — do not add multiple games to one codebase.

```bash
git clone <repo-url> my-tap-jump
cd my-tap-jump
npm install
cp .env.example .env
```

Then customize:

1. **`.env`** — set `VITE_GAME_ID` and `VITE_REPLAY_SECRET` (must match `game-api`)
2. **`src/game/config.ts`** — set `name`, `version`, screen size (`width` / `height`)
3. **`capacitor.config.ts`** — set `appId` and `appName`
4. **`src/game/scenes/GameplayScene.ts`** — implement your game mechanics
5. **`src/game/scenes/PreloadScene.ts`** — load your assets (images under `public/assets/images/`, audio under `public/assets/audio/`)
6. Add art/audio under **`public/assets/`** (served at `/assets/…` in dev/build)
7. Run `npm run dev`

## Project Structure

```
game-apps/
├── src/
│   ├── main.ts                # Entry → GameEngine.bootstrap()
│   ├── platform/              # Reusable platform (keep as-is across games)
│   │   ├── core/              # events, state, storage, api, analytics, advertising, error
│   │   ├── modules/           # i18n, shop, missions, leaderboard, notifications, save, …
│   │   ├── ui/                # Panels, BasePanelScene, HUD, toast, audio, fonts
│   │   └── bootstrap/         # App, GameEngine, providers, app-events, capacitor
│   └── game/                  # YOUR game — customize per project
│       ├── config.ts          # Display identity (id/name/size/physics) — no replaySecret
│       ├── howToPlaySteps.ts  # Game-specific how-to content
│       ├── utils/
│       └── scenes/            # Boot → Preload → Home + panel wrappers
├── public/assets/             # Static game assets (create per project)
│   ├── images/                # UI/game art
│   └── audio/                 # SFX + BGM (see Audio below)
├── native/                    # Native templates: fullscreen, FCM, AdMob (applied by scripts/)
├── scripts/                   # native-ops, apply-*-native, run-*-emulator/simulator, verify-game-config, …
├── documents/                 # Module + setup guides (linked below)
├── index.html
└── capacitor.config.ts
```

`android/` and `ios/` are generated locally via Capacitor and are **gitignored**. `build:android` / `build:ios` auto-add the platform when missing via `scripts/native-ops.mjs`.

## Path Aliases

| Alias                   | Path                            |
| ----------------------- | ------------------------------- |
| `@platform/ui`          | `src/platform/ui/index.ts`      |
| `@platform/ui/*`        | `src/platform/ui/*`             |
| `@platform/core`        | `src/platform/core`             |
| `@platform/core/*`      | `src/platform/core/*`           |
| `@platform/modules`     | `src/platform/modules/index.ts` |
| `@platform/modules/*`   | `src/platform/modules/*`        |
| `@platform/bootstrap`   | `src/platform/bootstrap`        |
| `@platform/bootstrap/*` | `src/platform/bootstrap/*`      |
| `@game/*`               | `src/game/*`                    |

## Architecture Layers

```
Game Layer        → src/game/ — gameplay + game-specific content (how-to steps, scenes)
     ↓ eventBus   |  @platform/ui (panels / BasePanelScene)
Platform UI       → src/platform/ui — Phaser panels, BasePanelScene, toast, sound
     ↓
Platform Modules  → src/platform/modules — feature services + controllers
     ↓
Platform Core     → src/platform/core — events, state, storage, api, RuntimeConfig
     ↓
Bootstrap         → src/platform/bootstrap — App, GameEngine, provider wiring
```

Games talk to the platform primarily via the **Event Bus**. `@platform/ui` exports Phaser UI (panels, toast, i18n `t`, `BasePanelScene`) — not module services like game-sync/share/rate. ESLint blocks `@platform/modules/*` from most of `src/game`.

```typescript
import { eventBus, AnalyticsEvents } from '@platform/core/events';
import { getConfig } from '@platform/core/config';

eventBus.emit('game:start', { gameId: getConfig().gameId });
eventBus.emit('score:update', { score: 100 });
eventBus.emit('game:over', { score: 100, duration: 30000 });
eventBus.emit('analytics', { event: AnalyticsEvents.SESSION_START });
```

**i18n / toast:** import from `@platform/ui`. Share / rate / game-sync: import from `@platform/modules/*`.

## Platform Modules

| Module        | Backend? | Description                                                                |
| ------------- | -------- | -------------------------------------------------------------------------- |
| guest         | **API**  | Anonymous guest + `secretToken` (`POST /guest/init`, storage `gsk:guest`)  |
| game-sync     | **API**  | Offline queue → HMAC `signature` batch upload (`POST /results`)            |
| leaderboard   | **API**  | Offline cache, TTL, Top 100 REST (`LEADERBOARD_LIMIT` = 100/page)          |
| notifications | **API**  | Push (FCM) + local daily reward; device token sync (`/devices`)            |
| i18n          | Local    | Runtime language switch (`en` / `vi`), lazy-loaded locale JSON             |
| shop          | Local    | Catalog skins/boosts/IAP; equip skin                                       |
| missions      | Local    | Daily missions; claim via EventBus; WATCH_AD via `MISSION_WATCH` placement |
| daily-reward  | Local    | 7-day streak in Preferences; claim via EventBus                            |
| save          | Local    | Single `game-save` key — hydrates Zustand (excludes daily-reward prefs)    |
| settings      | Local    | Language, sound, music — part of store state                               |
| deep-link     | Local    | Custom scheme, Universal Links / App Links, deferred cold-start navigation |
| navigation    | Local    | Scene navigation + pending queue (notification / deeplink cold start)      |
| share         | Local    | Native share sheet helper (used from Game Over)                            |
| ads (module)  | Local    | Placement config, banner context (`HOME` / `GAME_OVER` / …), reward flow   |
| IAP (module)  | Local\*  | Purchase, restore, entitlements; RevenueCat `logIn` on `guest.onReady`     |
| analytics     | Local    | Provider interface — Console + Firebase (core)                             |
| advertising   | Local    | AdMob / mock providers, placement state machines (core)                    |

\* IAP is client-authoritative in this starter kit (no game-api receipt validation). Local feature details: [documents/modules/local-features.md](./documents/modules/local-features.md).

## UI Framework

Feature screens are **Phaser scenes** that compose reusable **panels**. Seven panel scenes share `BasePanelScene` (`@platform/ui`) for background, close/`app:back`, optional GetCoins overlay, and ad context.

Fonts: **Fredoka** (`FREDOKA_FONT`). Settings UI is split into section modules under `platform/ui/settings/`. Home’s Play button badge uses i18n key `home.playBadge`.

The `@platform/ui` barrel re-exports panels, `t`/`toast`, and `BasePanelScene`. Import other helpers from their paths:

```typescript
import { t, toast, BasePanelScene } from '@platform/ui';
import { FREDOKA_FONT } from '@platform/ui/fonts';
import { soundManager } from '@platform/ui/audio/SoundManager';
import { createUIButton } from '@platform/ui/button/UIButton';

toast.show({ message: 'Coins +50', type: 'success' });

// UIButton supports optional badges and plays pop SFX by default.
const button = createUIButton({
  scene,
  position: { x: 0, y: 0 },
  background: { key: 'play-button-background' },
  sound: 'coin-drop',
  badge: {
    content: t('home.playBadge'),
    textStyle: { fontFamily: FREDOKA_FONT },
    background: {
      radius: 10,
      color: '#ff0000',
      border: { width: 3, color: '#ffffff' },
    },
    position: { x: 210, y: -10 },
  },
});
button.setBadgeContent('HOT');
button.setBadgeVisible(true);

// Play SFX directly (respects settings.soundEnabled)
soundManager.playCoinDrop();
soundManager.playCombine();
```

### Audio

Assets live in `public/assets/audio/` and are preloaded in `PreloadScene`. Playback goes through `soundManager` (`src/platform/ui/audio/SoundManager.ts`) and respects `settings.soundEnabled` / `settings.musicEnabled`.

| File                   | Method               | When                              |
| ---------------------- | -------------------- | --------------------------------- |
| `pop.mp3`              | `playPop()`          | UI button press (default)         |
| `coin-drop.mp3`        | `playCoinDrop()`     | Coin reward / coin-drop buttons   |
| `combine.mp3`          | `playCombine()`      | Two fruits merge                  |
| `disappear.mp3`        | `playDisappear()`    | Explosive Hammer destroys a fruit |
| `change-turns.mp3`     | `playChangeTurns()`  | Change Fruit swaps current ↔ next |
| `swoosh.mp3`           | `playSwoosh()`       | Swap exchanges two fruits         |
| `increase-size.mp3`    | `playIncreaseSize()` | Size Increase upgrades a fruit    |
| `reverse.mp3`          | `playReverse()`      | Undo restores the last move       |
| `background-music.mp3` | `syncMusic()`        | Looping BGM (music setting)       |

Change Fruit and Undo buttons use `sound: false` so only their skill SFX plays (no default pop).

`ScreenManager` is available for custom overlay screens. Built-in user-facing scenes: Home, Gameplay, GameOver, Shop, Missions, Leaderboard, DailyReward, Settings, HowToPlay, Legal.

## Environment Config

Copy `.env.example` to `.env` and adjust per environment. `.env.example` includes a dev sample `VITE_REPLAY_SECRET` matching `GAME_CONFIG.FRULOOP` on `game-api`; use your own secret in production.

```bash
VITE_APP_ENV=dev              # dev | production
VITE_GAME_ID=FRULOOP
VITE_REPLAY_SECRET=<64-char-lowercase-sha256-hex>
VITE_IAP_PROVIDER=mock        # mock | revenuecat
VITE_ADS_PROVIDER=mock        # mock | admob (AdMob used on native when admob)
VITE_ANALYTICS_PROVIDER=console # console | firebase
VITE_IOS_APP_STORE_ID=
VITE_ANDROID_PACKAGE_ID=com.vraxion.fruloop

# Native AdMob (build/release)
VITE_ADMOB_ANDROID_APP_ID=
VITE_ADMOB_IOS_APP_ID=

# Production ad unit IDs (when using real AdMob app IDs)
# VITE_ADMOB_ANDROID_BANNER_ID= …
# VITE_ADMOB_IOS_REWARDED_ID= …

# Firebase — analytics (when provider=firebase) + push gate on native
# VITE_FIREBASE_API_KEY=
# VITE_FIREBASE_AUTH_DOMAIN=
# VITE_FIREBASE_PROJECT_ID=
# VITE_FIREBASE_APP_ID=
# VITE_FIREBASE_MEASUREMENT_ID=
```

Push/local toggles per env: `src/platform/core/config/notification-env.json`. Native FCM setup: [documents/setup/firebase-native.md](./documents/setup/firebase-native.md). Full variable reference: [documents/setup/environment-variables.md](./documents/setup/environment-variables.md).

| Variable                                            | Description                                                                    |
| --------------------------------------------------- | ------------------------------------------------------------------------------ |
| `VITE_APP_ENV`                                      | Runtime environment (`dev`, `production`)                                      |
| `VITE_GAME_ID`                                      | Game id used by the frontend and backend                                       |
| `VITE_REPLAY_SECRET`                                | HMAC replay secret — **64-char lowercase hex**; must match backend per game id |
| `VITE_IAP_PROVIDER`                                 | `mock` or `revenuecat`                                                         |
| `VITE_ADS_PROVIDER`                                 | `mock` or `admob`                                                              |
| `VITE_ANALYTICS_PROVIDER`                           | `console` or `firebase`                                                        |
| `VITE_ADMOB_*_APP_ID`                               | Per-platform AdMob app IDs for native builds                                   |
| `VITE_ADMOB_*_*_ID`                                 | Production ad unit IDs per format/platform                                     |
| `VITE_FIREBASE_*`                                   | Firebase web config (analytics + push gate on native)                          |
| `VITE_IOS_APP_STORE_ID` / `VITE_ANDROID_PACKAGE_ID` | Store listing IDs attached when sharing scores                                 |

API URL, ads/analytics toggles, and defaults are in `src/platform/core/config/index.ts`. At boot, `GameEngine` calls `createConfig()` so `RuntimeConfig` reads `VITE_GAME_ID` / `VITE_REPLAY_SECRET`. `gameConfig` holds display fields (`name`, size, `physics`, `id`); it does **not** duplicate `replaySecret`. Deep-link scheme/hosts live in `src/platform/modules/deep-link/deep-link.config.ts` (keep in sync with `scripts/deeplink-config.mjs`) — not `.env`.

## Mobile Deployment

```bash
npm run build:android    # build + add platform if missing + assets + cap sync + native patches
npm run cap:android    # open Android Studio

npm run build:ios      # build + add platform if missing + assets + cap sync + native patches
npm run cap:ios        # open Xcode
```

### Capacitor Setup

`android/` and `ios/` are gitignored, so a fresh clone has no native projects. `build:android` / `build:ios` auto-add the platform when missing through `scripts/native-ops.mjs` (no separate `cap add` script required).

## Documentation

| Topic            | Path                                                                                     |
| ---------------- | ---------------------------------------------------------------------------------------- |
| Game config      | [documents/setup/game-configuration.md](./documents/setup/game-configuration.md)         |
| Guest identity   | [documents/modules/guest-identity.md](./documents/modules/guest-identity.md)             |
| Game result sync | [documents/modules/game-result-sync.md](./documents/modules/game-result-sync.md)         |
| Leaderboard      | [documents/modules/leaderboard.md](./documents/modules/leaderboard.md)                   |
| Notifications    | [documents/modules/notifications.md](./documents/modules/notifications.md)               |
| Local features   | [documents/modules/local-features.md](./documents/modules/local-features.md)             |
| Firebase native  | [documents/setup/firebase-native.md](./documents/setup/firebase-native.md)               |
| Mobile build     | [documents/setup/mobile-build.md](./documents/setup/mobile-build.md)                     |
| Environment vars | [documents/setup/environment-variables.md](./documents/setup/environment-variables.md)   |
| Emulator / sim   | [documents/build/emulator-and-simulator.md](./documents/build/emulator-and-simulator.md) |
| Deep links       | [documents/deeplink/README.md](./documents/deeplink/README.md)                           |

## Performance Targets

| Metric     | Target  |
| ---------- | ------- |
| FPS        | 60      |
| RAM        | < 150MB |
| Cold start | < 3s    |

## Scripts

| Command                      | Description                                                |
| ---------------------------- | ---------------------------------------------------------- |
| `npm run dev`                | Vite dev server (`:5173`)                                  |
| `npm run build`              | Typecheck + production build → `dist/`                     |
| `npm run preview`            | Preview production build                                   |
| `npm run lint`               | `tsc --noEmit` + ESLint on `src/`                          |
| `npm run game:verify-config` | Validate `VITE_GAME_ID` / `VITE_REPLAY_SECRET` + API probe |
| `npm run lint:fix`           | ESLint with auto-fix                                       |
| `npm run format`             | Prettier write                                             |
| `npm run format:check`       | Prettier check                                             |
| `npm run cap:android`        | Open Android Studio                                        |
| `npm run cap:ios`            | Open Xcode                                                 |
| `npm run assets:generate`    | Generate app icons/splash from `resources/`                |
| `npm run build:android`      | Full Android pipeline via `scripts/native-ops.mjs`         |
| `npm run build:ios`          | Full iOS pipeline via `scripts/native-ops.mjs`             |
| `npm run run:android`        | Build + compile APK + boot emulator + install + launch     |
| `npm run run:ios`            | Build + xcodebuild simulator + install + launch            |

`scripts/native-ops.mjs` accepts only `build <android|ios>`; platform creation is part of that build pipeline. There is no separate `ensure` action.

## Platform Updates

For cloned games, keep game-specific code in `src/game` and treat `src/platform` as the shared platform layer.

## License

Private — internal studio use.
