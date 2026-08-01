import type Phaser from 'phaser';

import { gameConfig } from '@game/config';
import { gameScenes } from '@game/scenes';
import { iap } from '@platform/modules/iap';
import { app } from '@platform/bootstrap/App';
import { eventBus } from '@platform/core/events';
import { toast } from '@platform/ui/toast/ToastManager';
import { loadGameFonts } from '@platform/bootstrap/fonts';
import { soundManager } from '@platform/ui/audio/SoundManager';
import { navigationService } from '@platform/modules/navigation';
import { DeviceType, getDeviceType } from '@platform/core/utils';
import { refreshServicesFromConfig } from '@platform/core/services';
import { initCapacitorPlugins } from '@platform/bootstrap/capacitor';
import { getConfig, setConfig, createConfig } from '@platform/core/config';
import { errorBoundary, setupGlobalErrorHandlers } from '@platform/core/error';

const TABLET_LETTERBOX_BG_ID = 'tablet-letterbox-bg';

function buildPhaserPhysics(): Phaser.Types.Core.PhysicsConfig | undefined {
  const physics = gameConfig.physics;
  if (!physics || physics.default === false || physics.default === undefined) {
    return undefined;
  }

  const config: Phaser.Types.Core.PhysicsConfig = {
    default: physics.default,
  };

  if (physics.matter) {
    config.matter = {
      debug: physics.matter.debug,
      gravity: physics.matter.gravity,
    };
  }

  return config;
}

class GameEngine {
  private game: Phaser.Game | null = null;
  private toastUnsub?: () => void;

  async bootstrap(): Promise<Phaser.Game> {
    if (this.game) return this.game;

    setupGlobalErrorHandlers();
    // createConfig already reads VITE_GAME_ID / VITE_REPLAY_SECRET into RuntimeConfig.
    setConfig(createConfig());
    refreshServicesFromConfig();
    iap.setEnabled(getConfig().iapEnabled);

    try {
      await app.init();
      await initCapacitorPlugins();
      await loadGameFonts();
    } catch (error) {
      errorBoundary.capture(error, 'app.init');
      throw error;
    }

    const config = getConfig();
    const PhaserLib = await import('phaser');
    const isTablet = getDeviceType() === DeviceType.TABLET;

    if (isTablet) {
      this.setupTabletLetterboxBackground();
    }

    const phaserConfig: Phaser.Types.Core.GameConfig = {
      scene: gameScenes,
      render: {
        antialias: true,
        pixelArt: false,
        roundPixels: true,
      },
      dom: {
        createContainer: true,
      },
      banner: config.debug,
      type: PhaserLib.AUTO,
      width: gameConfig.width,
      parent: 'game-container',
      audio: {
        disableWebAudio: false,
      },
      fps: {
        target: 60,
        forceSetTimeOut: false,
      },
      height: gameConfig.height,
      backgroundColor: '#1a1a2e',
      physics: buildPhaserPhysics(),
      scale: {
        autoCenter: PhaserLib.Scale.CENTER_BOTH,
        mode: isTablet ? PhaserLib.Scale.FIT : PhaserLib.Scale.ENVELOP,
      },
    };

    this.game = new PhaserLib.Game(phaserConfig);
    navigationService.setGame(this.game);
    toast.init(this.game);
    soundManager.init(this.game);
    this.toastUnsub = eventBus.on('ui:toast', (payload) => {
      toast.show(payload);
    });

    return this.game;
  }

  /** Full-viewport blurred backdrop behind the FIT letterbox on tablets. */
  private setupTabletLetterboxBackground(): void {
    const container = document.getElementById('game-container');
    if (!container || document.getElementById(TABLET_LETTERBOX_BG_ID)) return;

    container.classList.add('tablet-layout');

    const backdrop = document.createElement('div');
    backdrop.id = TABLET_LETTERBOX_BG_ID;
    backdrop.setAttribute('aria-hidden', 'true');
    container.prepend(backdrop);
  }

  destroy(): void {
    this.toastUnsub?.();
    this.toastUnsub = undefined;
    this.game?.destroy(true);
    this.game = null;

    document.getElementById(TABLET_LETTERBOX_BG_ID)?.remove();
    document.getElementById('game-container')?.classList.remove('tablet-layout');

    void app.destroy();
  }
}

export const gameEngine = new GameEngine();
