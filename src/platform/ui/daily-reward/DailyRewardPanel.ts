import Phaser from 'phaser';

import { toast } from '../toast/ToastManager';
import { eventBus } from '@platform/core/events';
import { FREDOKA_FONT } from '@platform/ui/fonts';
import { PanelHeader } from '../panel/PanelHeader';
import { drawRoundedRect } from '../panel/graphics';
import { createUIButton } from '../button/UIButton';
import { t } from '@platform/modules/i18n/i18n.service';
import type {
  RewardProgress,
  RewardDayProgress,
} from '@platform/modules/daily-reward/daily-reward.model';
import { DeferredListRebuild } from '../panel/deferredListRebuild';
import { PANEL_BG, TEXT_COLOR, PANEL_BORDER, PANEL_CORNER_RADIUS } from '../panel/panelTheme';

const DAY7_GAP = 36;
const GRID_COLS = 2;
const GRID_ROWS = 3;
const CELL_GAP_X = 14;
const CELL_GAP_Y = 28;
const DAY_COIN_SIZE = 56;
const CELL_BG = 0xf3d7a8;
const DAY7_COIN_SIZE = 28;
const CHECK_ICON_SIZE = 36;
const CELL_BORDER = 0xc9a86a;
const DAY7_BANNER = 0xffd54f;
const PANEL_CONTENT_PADDING_Y = 36;

function formatRewardAmount(value: number): string {
  return String(Math.floor(value));
}

interface CalendarLayout {
  gridWidth: number;
  cellWidth: number;
  day7Width: number;
  cellHeight: number;
  day7Height: number;
  contentHeight: number;
}

/**
 * Daily reward UI — Shop-style beige panel with 3×2 grid + featured day 7.
 */
export class DailyRewardPanel extends Phaser.GameObjects.Container {
  private readonly onBack: () => void;
  private readonly onNavigate: (sceneKey: string) => void;
  private readonly calendarRebuild = new DeferredListRebuild(() => {
    if (!this.latestProgress) return;
    this.rebuildFromProgress(this.latestProgress);
  });

  private claimPending = false;
  private header?: PanelHeader;
  private calendarLayout!: CalendarLayout;
  private statusText?: Phaser.GameObjects.Text;
  private unsubscribers: Array<() => void> = [];
  private claimButton?: Phaser.GameObjects.Container;
  private latestProgress: RewardProgress | null = null;
  private calendarContainer?: Phaser.GameObjects.Container;

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
    this.bindEvents();
    eventBus.emit('daily:progress:request', undefined);
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

  private getCalendarLayout(screenWidth: number): CalendarLayout {
    const gridWidth = Math.min(screenWidth * 0.88, 400);
    const cellWidth = (gridWidth - CELL_GAP_X * (GRID_COLS - 1)) / GRID_COLS;
    const cellHeight = Math.min(cellWidth * 0.85, 130);
    const day7Width = Math.min(screenWidth * 0.94, 440);
    const day7Height = Math.min(cellWidth * 0.95, 200);
    const contentHeight =
      GRID_ROWS * cellHeight + (GRID_ROWS - 1) * CELL_GAP_Y + DAY7_GAP + day7Height;

    return { gridWidth, cellWidth, cellHeight, day7Width, day7Height, contentHeight };
  }

  private bindEvents(): void {
    this.unsubscribers.push(
      eventBus.on('daily:progress', (progress) => {
        this.latestProgress = progress;
        this.calendarRebuild.schedule();
      }),
      eventBus.on('daily:claim:result', ({ success, message }) => {
        this.claimPending = false;
        this.calendarRebuild.setLocked(false);
        if (!success && message === 'time_manipulated') {
          toast.show({ message: t('dailyReward.timeManipulated'), type: 'error' });
        }
        eventBus.emit('daily:progress:request', undefined);
      })
    );
  }

  private requestClaim(): void {
    if (this.claimPending) return;
    this.claimPending = true;
    this.calendarRebuild.setLocked(true);
    this.claimButton?.setVisible(false);
    eventBus.emit('daily:claim:request', undefined);
  }

  private build(): void {
    const { width, height } = this.scene.cameras.main;
    const panelWidth = Math.min(width * 0.97, 460);
    this.calendarLayout = this.getCalendarLayout(width);
    const panelHeight = PANEL_CONTENT_PADDING_Y * 2 + this.calendarLayout.contentHeight;
    const panelTop = height * 0.24;

    const panel = this.scene.add.graphics();
    drawRoundedRect(
      panel,
      width / 2 - panelWidth / 2,
      panelTop,
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
      titleKey: 'dailyReward.title',
      excludeGetCoinScenes: ['DailyReward'],
      bannerWidth: Math.min(width * 0.98, 500),
    });
    this.add(this.header);

    this.calendarContainer = this.scene.add.container(
      width / 2,
      panelTop + PANEL_CONTENT_PADDING_Y
    );
    this.add(this.calendarContainer);

    const footerY = panelTop + panelHeight + 60;

    this.statusText = this.scene.add
      .text(width / 2, footerY, '', {
        fontSize: '22px',
        color: '#ffffff',
        fontFamily: FREDOKA_FONT,
        align: 'center',
        stroke: '#000000',
        strokeThickness: 4,
        wordWrap: { width: panelWidth * 0.85 },
      })
      .setOrigin(0.5);
    this.add(this.statusText);

    this.claimButton = createUIButton({
      scene: this.scene,
      position: { x: width / 2, y: footerY },
      size: { width: 200, height: 80 },
      background: { key: 'leaderboard-button-background' },
      text: {
        content: t('dailyReward.claim'),
        style: {
          fontSize: 22,
          fontStyle: 'bold',
          border: { width: 3, color: '#000000' },
        },
      },
      sound: 'coin-drop',
      onClick: () => this.requestClaim(),
    });
    this.claimButton.setVisible(false);
    this.add(this.claimButton);
  }

  private rebuildFromProgress(progress: RewardProgress): void {
    this.renderCalendar(progress.days, progress.canClaim);

    if (progress.timeManipulated) {
      this.statusText?.setText(t('dailyReward.timeManipulated')).setVisible(true);
      this.claimButton?.setVisible(false);
      return;
    }

    if (progress.canClaim) {
      this.statusText?.setVisible(false);
      this.claimButton?.setVisible(true);
      return;
    }

    this.claimButton?.setVisible(false);
    this.statusText?.setText(t('dailyReward.comeBack')).setVisible(true);
  }

  private renderCalendar(days: RewardDayProgress[], canClaim: boolean): void {
    if (!this.calendarContainer) return;
    this.calendarContainer.removeAll(true);

    const { gridWidth, cellWidth, cellHeight, day7Width, day7Height } = this.calendarLayout;
    const gridDays = days.filter((day) => day.day <= 6);
    const day7 = days.find((day) => day.day === 7);

    gridDays.forEach((entry, index) => {
      const col = index % GRID_COLS;
      const row = Math.floor(index / GRID_COLS);
      const x = -gridWidth / 2 + cellWidth / 2 + col * (cellWidth + CELL_GAP_X);
      const y = cellHeight / 2 + row * (cellHeight + CELL_GAP_Y);
      this.calendarContainer!.add(this.createDayCell(entry, canClaim, x, y, cellWidth, cellHeight));
    });

    if (day7) {
      const day7Top = GRID_ROWS * (cellHeight + CELL_GAP_Y) - CELL_GAP_Y + DAY7_GAP;
      this.calendarContainer.add(
        this.createDay7Cell(day7, canClaim, 0, day7Top, day7Width, day7Height)
      );
    }
  }

  private createDayCell(
    entry: RewardDayProgress,
    canClaim: boolean,
    x: number,
    y: number,
    cellWidth: number,
    cellHeight: number
  ): Phaser.GameObjects.Container {
    const container = this.scene.add.container(x, y);
    const isClaimed = entry.status === 'claimed';
    const isAvailable = entry.status === 'current' && canClaim;

    const bg = this.scene.add.graphics();
    drawRoundedRect(
      bg,
      -cellWidth / 2,
      -cellHeight / 2,
      cellWidth,
      cellHeight,
      16,
      CELL_BG,
      CELL_BORDER,
      2
    );
    container.add(bg);

    container.add(
      this.scene.add
        .text(0, -cellHeight * 0.34, t('dailyReward.day', { day: entry.day }), {
          fontSize: '18px',
          fontStyle: 'bold',
          color: TEXT_COLOR,
          fontFamily: FREDOKA_FONT,
        })
        .setOrigin(0.5)
    );

    const coin = this.scene.add.image(0, -4, 'coin-icon');
    coin.setDisplaySize(DAY_COIN_SIZE, DAY_COIN_SIZE);
    container.add(coin);

    container.add(
      this.scene.add
        .text(0, cellHeight * 0.32, formatRewardAmount(entry.coins ?? 0), {
          fontSize: '18px',
          fontStyle: 'bold',
          color: TEXT_COLOR,
          fontFamily: FREDOKA_FONT,
        })
        .setOrigin(0.5)
    );

    if (isClaimed) {
      const check = this.scene.add.image(
        cellWidth / 2 - CHECK_ICON_SIZE / 2,
        cellHeight / 2 - CHECK_ICON_SIZE / 2,
        'checked-icon'
      );
      check.setDisplaySize(CHECK_ICON_SIZE, CHECK_ICON_SIZE);
      container.add(check);
    }

    if (isAvailable) {
      this.makeClaimable(container, bg, cellWidth, cellHeight);
    }

    return container;
  }

  private createDay7Cell(
    entry: RewardDayProgress,
    canClaim: boolean,
    x: number,
    y: number,
    width: number,
    height: number
  ): Phaser.GameObjects.Container {
    const container = this.scene.add.container(x, y + height / 2);
    const isClaimed = entry.status === 'claimed';
    const isAvailable = entry.status === 'current' && canClaim;

    const chestKey = this.scene.textures.exists('chest-icon') ? 'chest-icon' : 'coin-icon';
    const chest = this.scene.add.image(0, 4, chestKey);
    const scale = Math.min((width * 0.92) / chest.width, (height * 0.92) / chest.height);
    chest.setScale(scale);
    container.add(chest);

    const bannerWidth = Math.min(140, width * 0.36);
    const bannerHeight = 34;
    const bannerY = -height / 2 + 4;
    const banner = this.scene.add.graphics();
    banner.fillStyle(DAY7_BANNER, 1);
    banner.fillRoundedRect(-bannerWidth / 2, bannerY, bannerWidth, bannerHeight, bannerHeight / 2);
    banner.lineStyle(2, 0xb5974f, 1);
    banner.strokeRoundedRect(
      -bannerWidth / 2,
      bannerY,
      bannerWidth,
      bannerHeight,
      bannerHeight / 2
    );
    container.add(banner);

    container.add(
      this.scene.add
        .text(0, bannerY + bannerHeight / 2, t('dailyReward.day', { day: entry.day }), {
          fontSize: '18px',
          fontStyle: 'bold',
          color: TEXT_COLOR,
          fontFamily: FREDOKA_FONT,
        })
        .setOrigin(0.5)
    );

    const rewardY = height / 2 - 22;
    const amount = formatRewardAmount(entry.coins ?? 2100);
    const amountText = this.scene.add.text(0, rewardY, amount, {
      fontSize: '22px',
      fontStyle: 'bold',
      color: '#ffffff',
      fontFamily: FREDOKA_FONT,
      stroke: '#000000',
      strokeThickness: 4,
    });
    const rewardWidth = DAY7_COIN_SIZE + 8 + amountText.width;
    const rewardLeft = -rewardWidth / 2;

    const coin = this.scene.add.image(rewardLeft + DAY7_COIN_SIZE / 2, rewardY, 'coin-icon');
    coin.setDisplaySize(DAY7_COIN_SIZE, DAY7_COIN_SIZE);
    container.add(coin);

    amountText.setPosition(rewardLeft + DAY7_COIN_SIZE + 8, rewardY).setOrigin(0, 0.5);
    container.add(amountText);

    if (isClaimed) {
      const check = this.scene.add.image(
        width / 2 - CHECK_ICON_SIZE / 2 - 8,
        height / 2 - CHECK_ICON_SIZE / 2 - 8,
        'checked-icon'
      );
      check.setDisplaySize(CHECK_ICON_SIZE, CHECK_ICON_SIZE);
      container.add(check);
    }

    if (isAvailable) {
      const hit = this.scene.add
        .rectangle(0, 0, width, height, 0x000000, 0)
        .setInteractive({ useHandCursor: true });
      hit.on('pointerdown', () => this.requestClaim());
      container.add(hit);
      this.scene.tweens.add({
        targets: container,
        scaleX: 1.03,
        scaleY: 1.03,
        yoyo: true,
        repeat: -1,
        duration: 700,
        ease: 'Sine.easeInOut',
      });
    }

    return container;
  }

  private makeClaimable(
    container: Phaser.GameObjects.Container,
    _bg: Phaser.GameObjects.Graphics,
    cellWidth: number,
    cellHeight: number
  ): void {
    const hit = this.scene.add
      .rectangle(0, 0, cellWidth, cellHeight, 0x000000, 0)
      .setInteractive({ useHandCursor: true });
    hit.on('pointerdown', () => this.requestClaim());
    container.add(hit);

    this.scene.tweens.add({
      targets: container,
      scaleX: 1.05,
      scaleY: 1.05,
      yoyo: true,
      repeat: -1,
      duration: 700,
      ease: 'Sine.easeInOut',
    });
  }
}
