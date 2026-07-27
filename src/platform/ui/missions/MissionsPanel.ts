import Phaser from 'phaser';

import {
  PANEL_BG,
  TEXT_COLOR,
  PANEL_BORDER,
  PANEL_CORNER_RADIUS,
  PANEL_LIST_PADDING,
} from '../panel/panelTheme';
import { toast } from '../toast/ToastManager';
import { eventBus } from '@platform/core/events';
import { FREDOKA_FONT } from '@platform/ui/fonts';
import { PanelHeader } from '../panel/PanelHeader';
import { createUIButton } from '../button/UIButton';
import { drawRoundedRect } from '../panel/graphics';
import { formatNumber } from '@platform/core/utils';
import type { MissionProgress } from '@platform/core/state';
import { t, i18n } from '@platform/modules/i18n/i18n.service';
import { saveService } from '@platform/modules/save';
import { missions } from '@platform/modules/missions/mission.service';

const ACTION_BTN_WIDTH = 88;
const REWARD_ICON_SIZE = 36;
const ITEM_ROW_HEIGHT = 140;
const ACTION_BTN_HEIGHT = 52;
const PROGRESS_BAR_HEIGHT = 22;
const PROGRESS_BAR_COLOR = 0x3cb043;
const PROGRESS_FILL_COLOR = 0x1f5c2e;
/** Rewarded placement used for WATCH_AD mission progress. */
const MISSION_AD_PLACEMENT = 'DOUBLE_COIN';
const FALLBACK_MISSION_ICON = 'mission-item-1';

function formatMissionNumber(value: number): string {
  const locale = i18n.getCurrentLanguage() === 'vi' ? 'vi-VN' : 'en-US';
  return new Intl.NumberFormat(locale).format(Math.floor(value));
}

/**
 * Missions list UI — lives in platform/ui so game scenes stay event-driven.
 */
export class MissionsPanel extends Phaser.GameObjects.Container {
  private readonly onBack: () => void;
  private readonly onNavigate: (sceneKey: string) => void;

  private header?: PanelHeader;
  private unsubscribers: Array<() => void> = [];
  private listContainer?: Phaser.GameObjects.Container;

  constructor(
    scene: Phaser.Scene,
    options: {
      onBack: () => void;
      onNavigate: (sceneKey: string) => void;
    }
  ) {
    super(scene, 0, 0);
    this.onBack = options.onBack;
    this.onNavigate = options.onNavigate;
    scene.add.existing(this);
    this.build();
    if (
      missions.applyResets() ||
      missions.recordDailyLogin() ||
      missions.syncReachScoreFromHighScore()
    ) {
      void saveService.saveLocal();
    }
    this.renderMissions();
    this.bindEvents();
  }

  destroy(fromScene?: boolean): void {
    for (const unsub of this.unsubscribers) unsub();
    this.unsubscribers = [];
    this.header = undefined;
    super.destroy(fromScene);
  }

  isGetCoinsModalOpen(): boolean {
    return !!this.header?.isGetCoinsModalOpen();
  }

  hideGetCoinsModal(): void {
    this.header?.hideGetCoinsModal();
  }

  private bindEvents(): void {
    this.unsubscribers.push(
      eventBus.on('mission:update', () => this.renderMissions()),
      eventBus.on('mission:complete', () => this.renderMissions()),
      eventBus.on('ad:reward:result', ({ success, message }) => {
        if (success) {
          this.renderMissions();
          return;
        }
        if (message) {
          toast.show({ message, type: 'error' });
        }
      })
    );
  }

  private build(): void {
    const { width, height } = this.scene.cameras.main;
    const panelWidth = Math.min(width * 0.97, 460);
    const itemCount = Math.max(missions.getMissions().length, 1);
    const panelHeight =
      PANEL_LIST_PADDING * 2 + ITEM_ROW_HEIGHT * (itemCount - 1) + ITEM_ROW_HEIGHT * 0.85;
    const panelTop = height * 0.24;
    const panelY = panelTop + panelHeight / 2;

    const panel = this.scene.add.graphics();
    drawRoundedRect(
      panel,
      width / 2 - panelWidth / 2,
      panelY - panelHeight / 2,
      panelWidth,
      panelHeight,
      PANEL_CORNER_RADIUS,
      PANEL_BG,
      PANEL_BORDER
    );
    this.add(panel);

    this.header = new PanelHeader(this.scene, {
      onBack: this.onBack,
      onNavigate: this.onNavigate,
      titleKey: 'missions.title',
      excludeGetCoinScenes: ['Missions'],
    });
    this.add(this.header);

    this.listContainer = this.scene.add.container(
      width / 2,
      panelTop + PANEL_LIST_PADDING + ITEM_ROW_HEIGHT * 0.4
    );
    this.add(this.listContainer);
  }

  private renderMissions(): void {
    if (!this.listContainer) return;
    this.listContainer.removeAll(true);

    const { width } = this.scene.cameras.main;
    const items = missions.getMissions();
    const rowWidth = Math.min(width * 0.91, 430);

    items.forEach((mission, index) => {
      const y = index * ITEM_ROW_HEIGHT;
      this.listContainer!.add(this.createMissionRow(mission, y, rowWidth));

      if (index < items.length - 1) {
        this.listContainer!.add(
          this.scene.add.rectangle(
            0,
            y + ITEM_ROW_HEIGHT / 2,
            rowWidth * 0.92,
            2,
            PANEL_BORDER,
            0.55
          )
        );
      }
    });
  }

  private createMissionRow(
    mission: MissionProgress,
    y: number,
    rowWidth: number
  ): Phaser.GameObjects.Container {
    const container = this.scene.add.container(0, y);
    const def = missions.getDefinition(mission.id);
    const title = def ? t(def.titleKey) : mission.id;
    const coins = def?.reward.type === 'coins' ? def.reward.amount : 0;
    const progress = Math.min(mission.progress, mission.target);
    const ratio = mission.target > 0 ? Math.min(1, progress / mission.target) : 0;
    const rowHalf = rowWidth / 2;

    const iconSize = 72;
    const iconX = -rowHalf + iconSize / 2 + 4;
    const iconKey =
      def?.icon && this.scene.textures.exists(def.icon) ? def.icon : FALLBACK_MISSION_ICON;
    const icon = this.scene.add.image(iconX, 0, iconKey);
    icon.setDisplaySize(iconSize, iconSize);
    container.add(icon);

    const actionX = rowHalf - ACTION_BTN_WIDTH / 2 - 4;
    const rewardX = actionX - ACTION_BTN_WIDTH / 2 - 28;
    const contentLeft = iconX + iconSize / 2 + 10;
    const barWidth = Math.max(90, rewardX - contentLeft - 48);

    container.add(
      this.scene.add.text(contentLeft, -28, title, {
        fontSize: '18px',
        fontStyle: 'bold',
        color: TEXT_COLOR,
        fontFamily: FREDOKA_FONT,
        wordWrap: { width: barWidth + 20 },
      })
    );

    container.add(
      this.createProgressBar(contentLeft, 10, barWidth, progress, mission.target, ratio)
    );
    container.add(this.createReward(rewardX, coins));
    container.add(this.createActionButton(mission, def?.type, def?.goScene, actionX));

    return container;
  }

  private createProgressBar(
    x: number,
    y: number,
    width: number,
    current: number,
    target: number,
    ratio: number
  ): Phaser.GameObjects.Container {
    const container = this.scene.add.container(x, y);
    const radius = PROGRESS_BAR_HEIGHT / 2;

    const bg = this.scene.add.graphics();
    bg.fillStyle(PROGRESS_BAR_COLOR, 1);
    bg.fillRoundedRect(0, -PROGRESS_BAR_HEIGHT / 2, width, PROGRESS_BAR_HEIGHT, radius);
    container.add(bg);

    if (ratio > 0) {
      const fillWidth = Math.max(radius * 2, width * ratio);
      const fill = this.scene.add.graphics();
      fill.fillStyle(PROGRESS_FILL_COLOR, 1);
      fill.fillRoundedRect(0, -PROGRESS_BAR_HEIGHT / 2, fillWidth, PROGRESS_BAR_HEIGHT, radius);
      container.add(fill);
    }

    container.add(
      this.scene.add
        .text(
          width / 2,
          0,
          t('missions.progress', {
            current: formatMissionNumber(current),
            target: formatMissionNumber(target),
          }),
          {
            fontSize: '14px',
            fontStyle: 'bold',
            color: '#ffffff',
            fontFamily: FREDOKA_FONT,
            stroke: '#000000',
            strokeThickness: 2,
          }
        )
        .setOrigin(0.5)
    );

    return container;
  }

  private createReward(x: number, coins: number): Phaser.GameObjects.Container {
    const container = this.scene.add.container(x, 0);
    const coin = this.scene.add.image(0, -12, 'coin-icon');
    coin.setDisplaySize(REWARD_ICON_SIZE, REWARD_ICON_SIZE);
    container.add(coin);

    container.add(
      this.scene.add
        .text(0, 18, formatNumber(coins), {
          fontSize: '16px',
          fontStyle: 'bold',
          color: TEXT_COLOR,
          fontFamily: FREDOKA_FONT,
        })
        .setOrigin(0.5)
    );

    return container;
  }

  private createActionButton(
    mission: MissionProgress,
    type: string | undefined,
    goScene: string | undefined,
    x: number
  ): Phaser.GameObjects.GameObject {
    if (mission.status === 'completed') {
      return createUIButton({
        scene: this.scene,
        position: { x, y: 0 },
        size: { width: ACTION_BTN_WIDTH, height: ACTION_BTN_HEIGHT },
        background: { key: 'leaderboard-button-background' },
        text: {
          content: t('missions.claim'),
          style: {
            fontSize: 18,
            fontStyle: 'bold',
            border: { width: 3, color: '#000000' },
          },
        },
        sound: 'coin-drop',
        onClick: () => this.handleClaim(mission.id),
      });
    }

    if (mission.status === 'claimed') {
      return this.scene.add
        .text(x, 0, t('missions.claimed'), {
          fontSize: '14px',
          fontStyle: 'bold',
          color: '#3cb043',
          fontFamily: FREDOKA_FONT,
        })
        .setOrigin(0.5);
    }

    return createUIButton({
      scene: this.scene,
      position: { x, y: 0 },
      size: { width: ACTION_BTN_WIDTH, height: ACTION_BTN_HEIGHT },
      background: { key: 'settings-button-background' },
      text: {
        content: t('missions.go'),
        style: {
          fontSize: 18,
          fontStyle: 'bold',
          border: { width: 3, color: '#000000' },
        },
      },
      onClick: () => this.handleGo(type, goScene),
    });
  }

  private handleGo(type: string | undefined, goScene: string | undefined): void {
    if (type === 'WATCH_AD') {
      eventBus.emit('ad:reward:request', { placement: MISSION_AD_PLACEMENT });
      return;
    }

    if (goScene) {
      this.onNavigate(goScene);
    }
  }

  private handleClaim(missionId: string): void {
    const success = missions.claimMission(missionId);
    if (success) {
      void saveService.saveLocal();
      this.renderMissions();
    } else {
      toast.show({ message: t('missions.claimFailed'), type: 'error' });
    }
  }
}
