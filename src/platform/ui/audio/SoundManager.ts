import Phaser from 'phaser';

import { eventBus } from '@platform/core/events';
import { usePlatformStore } from '@platform/core/state';

export const SOUND_COIN_DROP_KEY = 'coin-drop';
export const SOUND_POP_KEY = 'pop';
export const SOUND_COMBINE_KEY = 'combine';
export const SOUND_DISAPPEAR_KEY = 'disappear';
export const SOUND_CHANGE_TURNS_KEY = 'change-turns';
export const SOUND_SWOOSH_KEY = 'swoosh';
export const SOUND_INCREASE_SIZE_KEY = 'increase-size';
export const SOUND_REVERSE_KEY = 'reverse';
export const SOUND_BGM_KEY = 'background-music';

class SoundManager {
  private game: Phaser.Game | null = null;
  private bgm: Phaser.Sound.BaseSound | null = null;
  private unlockBound = false;
  private settingsUnsub?: () => void;
  private pauseUnsub?: () => void;
  private resumeUnsub?: () => void;

  init(game: Phaser.Game): void {
    this.game = game;
    this.settingsUnsub?.();
    this.pauseUnsub?.();
    this.resumeUnsub?.();

    this.settingsUnsub = eventBus.on('settings:change', ({ key }) => {
      if (key === 'musicEnabled') {
        this.syncMusic();
      }
    });

    this.pauseUnsub = eventBus.on('app:pause', () => {
      this.pauseMusic();
    });

    this.resumeUnsub = eventBus.on('app:resume', () => {
      this.syncMusic();
    });

    this.bindUnlock();
  }

  isSoundEnabled(): boolean {
    return usePlatformStore.getState().settings.soundEnabled;
  }

  isMusicEnabled(): boolean {
    return usePlatformStore.getState().settings.musicEnabled;
  }

  play(key: string): void {
    if (!this.isSoundEnabled()) return;

    const scene = this.getActiveScene();
    if (!scene) return;

    if (scene.sound.locked) {
      scene.sound.unlock();
    }

    if (scene.cache.audio.exists(key)) {
      scene.sound.play(key);
    }
  }

  playPop(): void {
    this.play(SOUND_POP_KEY);
  }

  playCoinDrop(): void {
    this.play(SOUND_COIN_DROP_KEY);
  }

  playCombine(): void {
    this.play(SOUND_COMBINE_KEY);
  }

  playDisappear(): void {
    this.play(SOUND_DISAPPEAR_KEY);
  }

  playChangeTurns(): void {
    this.play(SOUND_CHANGE_TURNS_KEY);
  }

  playSwoosh(): void {
    this.play(SOUND_SWOOSH_KEY);
  }

  playIncreaseSize(): void {
    this.play(SOUND_INCREASE_SIZE_KEY);
  }

  playReverse(): void {
    this.play(SOUND_REVERSE_KEY);
  }

  /** Start or stop looping BGM according to the current music setting. */
  syncMusic(): void {
    if (!this.isMusicEnabled()) {
      this.stopMusic();
      return;
    }
    this.startMusic();
  }

  private startMusic(): void {
    if (!this.game?.cache.audio.exists(SOUND_BGM_KEY)) return;

    const scene = this.getActiveScene();
    if (scene?.sound.locked) {
      scene.sound.unlock();
    }

    // Drop stale refs — scene-owned sounds die on scene.start/shutdown.
    if (this.bgm && !this.isBgmAlive()) {
      this.bgm = null;
    }

    if (this.bgm) {
      if (this.bgm.isPaused) {
        this.bgm.resume();
        return;
      }
      if (this.bgm.isPlaying) return;
      this.bgm.play({ loop: true, volume: 0.45 });
      return;
    }

    // Use game-level sound so BGM survives scene transitions.
    this.bgm = this.game.sound.add(SOUND_BGM_KEY, { loop: true, volume: 0.45 });
    this.bgm.play();
  }

  private stopMusic(): void {
    if (!this.bgm) return;
    if (this.isBgmAlive()) {
      this.bgm.stop();
    } else {
      this.bgm = null;
    }
  }

  private pauseMusic(): void {
    if (this.bgm && this.isBgmAlive() && this.bgm.isPlaying) {
      this.bgm.pause();
    }
  }

  /** True while the BGM instance is still registered with the sound manager. */
  private isBgmAlive(): boolean {
    if (!this.bgm || !this.game) return false;
    return this.game.sound.getAll(SOUND_BGM_KEY).includes(this.bgm);
  }

  private bindUnlock(): void {
    if (this.unlockBound || typeof document === 'undefined') return;
    this.unlockBound = true;

    const tryStart = () => {
      const scene = this.getActiveScene();
      if (scene?.sound.locked) {
        scene.sound.unlock();
      }
      this.syncMusic();
    };

    document.addEventListener('pointerdown', tryStart, { once: true });
    document.addEventListener('keydown', tryStart, { once: true });
  }

  private getActiveScene(): Phaser.Scene | null {
    if (!this.game) return null;
    const scenes = this.game.scene.getScenes(true);
    return scenes[scenes.length - 1] ?? null;
  }
}

export const soundManager = new SoundManager();
