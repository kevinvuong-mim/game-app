/**
 * Game identity & display settings.
 * Update this file when starting a new game (after cloning this repo).
 *
 * `id` comes from `VITE_GAME_ID` and must match a `GameId` enum value on game-api.
 */
export interface GamePhysicsConfig {
  /** Phaser physics system. Omit or set false for no physics. */
  default?: 'matter' | false;
  matter?: {
    debug?: boolean;
    gravity?: { x: number; y: number };
  };
}

export interface GameConfig {
  id: string;
  name: string;
  width: number;
  height: number;
  version: string;
  /** Optional Phaser physics block — defaults to no physics when omitted. */
  physics?: GamePhysicsConfig;
}

export const gameConfig: GameConfig = {
  width: 720,
  height: 1280,
  name: 'Memora',
  version: '1.0.0',
  id: import.meta.env.VITE_GAME_ID ?? '',
  // Suika demo uses Matter; replace or remove when cloning a non-physics game.
  physics: {
    default: 'matter',
    matter: {
      debug: false,
      gravity: { x: 0, y: 1.4 },
    },
  },
};
