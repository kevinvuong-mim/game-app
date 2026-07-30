/**
 * Game identity & display settings.
 * Update this file when starting a new game (after cloning this repo).
 *
 * `id` comes from `VITE_GAME_ID` and must match a `GameId` enum value on game-api.
 * `replaySecret` is injected via `VITE_REPLAY_SECRET` — never hardcode the real value.
 */
export interface GamePhysicsConfig {
  /** Phaser physics system. Omit or set false for no physics. */
  default?: 'matter' | false;
  matter?: {
    gravity?: { x: number; y: number };
    debug?: boolean;
  };
}

export interface GameConfig {
  id: string;
  name: string;
  width: number;
  height: number;
  version: string;
  replaySecret: string;
  /** Optional Phaser physics block — defaults to no physics when omitted. */
  physics?: GamePhysicsConfig;
}

export const gameConfig: GameConfig = {
  width: 720,
  height: 1280,
  version: '1.0.0',
  name: 'Fruloop',
  id: import.meta.env.VITE_GAME_ID ?? '',
  replaySecret: import.meta.env.VITE_REPLAY_SECRET ?? '',
  // Suika demo uses Matter; replace or remove when cloning a non-physics game.
  physics: {
    default: 'matter',
    matter: {
      gravity: { x: 0, y: 1.4 },
      debug: false,
    },
  },
};
