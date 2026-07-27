import { BootScene } from './BootScene';
import { HomeScene } from './HomeScene';
import { ShopScene } from './ShopScene';
import { LegalScene } from './LegalScene';
import { PreloadScene } from './PreloadScene';
import { GameplayScene } from './GameplayScene';
import { GameOverScene } from './GameOverScene';
import { MissionsScene } from './MissionsScene';
import { SettingsScene } from './SettingsScene';
import { HowToPlayScene } from './HowToPlayScene';
import { DailyRewardScene } from './DailyRewardScene';
import { LeaderboardScene } from './LeaderboardScene';

// Phaser auto-starts the first scene; Boot → Preload → Home via scene.start().
// Order of the remaining scenes only registers them for later navigation.
export const gameScenes = [
  BootScene,
  HomeScene,
  ShopScene,
  LegalScene,
  PreloadScene,
  GameplayScene,
  GameOverScene,
  MissionsScene,
  SettingsScene,
  HowToPlayScene,
  DailyRewardScene,
  LeaderboardScene,
];
