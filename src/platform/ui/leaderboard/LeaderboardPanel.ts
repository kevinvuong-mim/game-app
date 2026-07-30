import Phaser from 'phaser';

import {
  PANEL_BG,
  TEXT_COLOR,
  PANEL_BORDER,
  PANEL_CORNER_RADIUS,
  PANEL_LIST_PADDING,
} from '../panel/panelTheme';
import { guest } from '@platform/modules/guest';
import { eventBus } from '@platform/core/events';
import { FREDOKA_FONT } from '@platform/ui/fonts';
import type { UIButton } from '@platform/ui/types';
import { drawRoundedRect } from '../panel/graphics';
import { createUIButton } from '../button/UIButton';
import { t, i18n } from '@platform/modules/i18n/i18n.service';
import type { LeaderboardEntry, LeaderboardView } from '@platform/modules/leaderboard';
import { LEADERBOARD_LIMIT, getLeaderboardDisplayName } from '@platform/modules/leaderboard';

const ROW_HEIGHT = 56;
const CROWN_SIZE = 40;
const RANK_COL_WIDTH = 48;
const PILL_HEIGHT = 40;
const PILL_RADIUS = 18;
const PILL_OVERLAP = 18;
const TAB_GREEN = 0x1f6b32;
const TAB_GREEN_BORDER = 0x145024;
const ROW_HIGHLIGHT = 0xfff6e4;
const DIVIDER_COLOR = 0xd4c09a;
const SKELETON_ROWS = 8;
const REFRESHING_LIST_ALPHA = 0.72;

const CROWN_KEYS: Record<1 | 2 | 3, string> = {
  1: 'golden-crown-icon',
  2: 'silver-crown-icon',
  3: 'bronze-crown-icon',
};

/**
 * Leaderboard UI matching the ranking mock: Settings-style header, Top 100
 * scrollable list, and a fixed "Your Rank" footer.
 * Fully event-driven — emits `leaderboard:refresh` and renders `leaderboard:update`.
 */
export class LeaderboardPanel extends Phaser.GameObjects.Container {
  private readonly onBack: () => void;
  private readonly wheelHandler: (
    pointer: Phaser.Input.Pointer,
    gameObjects: Phaser.GameObjects.GameObject[],
    deltaX: number,
    deltaY: number
  ) => void;

  private panelWidth = 0;
  private panelLeft = 0;
  private listTop = 0;
  private listHeight = 0;
  private listCenterY = 0;
  private listBaseY = 0;
  private rowWidth = 0;
  private scrollY = 0;
  private maxScroll = 0;
  private cleanedUp = false;

  private retryButton!: UIButton;
  private statusText!: Phaser.GameObjects.Text;
  private listContainer!: Phaser.GameObjects.Container;
  private skeletonContainer!: Phaser.GameObjects.Container;
  private myRankContainer!: Phaser.GameObjects.Container;
  private contentHitArea?: Phaser.GameObjects.Rectangle;
  private contentMaskShape?: Phaser.GameObjects.Graphics;
  private unsubscribers: Array<() => void> = [];

  constructor(scene: Phaser.Scene, options: { onBack: () => void }) {
    super(scene, 0, 0);
    this.onBack = options.onBack;
    this.wheelHandler = (_pointer, _gameObjects, _deltaX, deltaY) => {
      if (!this.contentHitArea?.getBounds().contains(_pointer.x, _pointer.y)) return;
      this.setScroll(this.scrollY + deltaY * 0.5);
    };
    scene.add.existing(this);
    this.build();
    this.bindEvents();
    this.refresh();
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
  }

  destroy(fromScene?: boolean): void {
    this.cleanup();
    super.destroy(fromScene);
  }

  private cleanup(): void {
    if (this.cleanedUp) return;
    this.cleanedUp = true;
    for (const unsub of this.unsubscribers) unsub();
    this.unsubscribers = [];
    this.scene?.input?.off('wheel', this.wheelHandler);
    this.contentMaskShape?.destroy();
    this.contentMaskShape = undefined;
  }

  private build(): void {
    const { width, height } = this.scene.cameras.main;

    this.panelWidth = Math.min(width * 0.94, 440);
    this.panelLeft = width / 2 - this.panelWidth / 2;
    this.rowWidth = this.panelWidth - PANEL_LIST_PADDING * 2;

    this.add(
      createUIButton({
        scene: this.scene,
        size: { width: 80, height: 80 },
        background: { key: 'back-icon' },
        onClick: this.onBack,
        position: { x: width * 0.18, y: height * 0.08 },
      })
    );

    this.buildBanner(width, height);

    const mainPanelTop = height * 0.22;
    const myRankPanelBottom = height * 0.9;
    const myRankPanelHeight = 108;
    const myRankPanelTop = myRankPanelBottom - myRankPanelHeight;
    // Keep Top 100 shorter than full gap so it doesn't crowd the "Your Rank" footer.
    const mainPanelHeight = Math.min(height * 0.56, myRankPanelTop - mainPanelTop - 28);

    this.buildSectionPanel(this.panelLeft, mainPanelTop, this.panelWidth, mainPanelHeight);
    this.buildPill(
      width / 2,
      mainPanelTop - PILL_HEIGHT + PILL_OVERLAP,
      Math.min(160, this.panelWidth * 0.42),
      t('leaderboard.top100')
    );

    this.listTop = mainPanelTop + PILL_OVERLAP + 12;
    this.listHeight = mainPanelHeight - (this.listTop - mainPanelTop) - PANEL_LIST_PADDING;
    this.listCenterY = this.listTop + this.listHeight / 2;
    this.listBaseY = this.listTop;

    this.contentMaskShape = this.scene.make.graphics({}, false);
    this.contentMaskShape.fillStyle(0xffffff);
    this.contentMaskShape.fillRect(
      this.panelLeft + PANEL_LIST_PADDING,
      this.listTop,
      this.rowWidth,
      this.listHeight
    );
    const mask = this.contentMaskShape.createGeometryMask();

    this.listContainer = this.scene.add.container(width / 2, this.listBaseY);
    this.listContainer.setMask(mask);
    this.add(this.listContainer);

    this.skeletonContainer = this.scene.add.container(width / 2, this.listBaseY);
    this.skeletonContainer.setMask(mask);
    this.skeletonContainer.setVisible(false);
    this.add(this.skeletonContainer);
    this.buildSkeleton();

    this.contentHitArea = this.scene.add
      .rectangle(width / 2, this.listCenterY, this.rowWidth, this.listHeight, 0x000000, 0)
      .setInteractive({ useHandCursor: true });
    this.add(this.contentHitArea);
    this.bindScroll();

    this.statusText = this.scene.add
      .text(width / 2, this.listCenterY, '', {
        fontSize: '18px',
        color: TEXT_COLOR,
        align: 'center',
        fontFamily: FREDOKA_FONT,
        wordWrap: { width: this.rowWidth - 16 },
      })
      .setOrigin(0.5);
    this.add(this.statusText);

    this.retryButton = createUIButton({
      scene: this.scene,
      position: { x: width / 2, y: this.listCenterY + 56 },
      size: { width: 160, height: 52 },
      background: { key: 'leaderboard-button-background' },
      text: {
        content: t('leaderboard.retry').toUpperCase(),
        style: {
          fontSize: 18,
          fontStyle: 'bold',
          border: { width: 3, color: '#000000' },
        },
      },
      onClick: () => this.refresh(),
    });
    this.retryButton.setVisible(false);
    this.add(this.retryButton);

    this.buildSectionPanel(this.panelLeft, myRankPanelTop, this.panelWidth, myRankPanelHeight);
    this.buildPill(
      width / 2,
      myRankPanelTop - PILL_HEIGHT + PILL_OVERLAP,
      Math.min(220, this.panelWidth * 0.58),
      t('leaderboard.yourRank').toUpperCase()
    );

    this.myRankContainer = this.scene.add.container(
      width / 2,
      myRankPanelTop + myRankPanelHeight / 2 + 6
    );
    this.add(this.myRankContainer);
  }

  private buildBanner(width: number, height: number): void {
    const bannerY = height * 0.16;
    const banner = this.scene.add.image(width / 2, bannerY, 'shop-banner');
    const defaultWidth = Math.min(width * 0.72, 360);
    const targetWidth = Math.min(width * 0.98, 500);
    const targetHeight = banner.height * (defaultWidth / banner.width);
    banner.setDisplaySize(targetWidth, targetHeight);
    this.add(banner);

    this.add(
      this.scene.add
        .text(width / 2, bannerY - 14, t('leaderboard.title').toUpperCase(), {
          fontSize: '42px',
          color: '#ffffff',
          fontStyle: 'bold',
          stroke: '#000000',
          strokeThickness: 5,
          fontFamily: FREDOKA_FONT,
        })
        .setOrigin(0.5)
    );
  }

  private buildSectionPanel(x: number, y: number, width: number, height: number): void {
    const panel = this.scene.add.graphics();
    drawRoundedRect(panel, x, y, width, height, PANEL_CORNER_RADIUS, PANEL_BG, PANEL_BORDER);
    this.add(panel);
  }

  private buildPill(centerX: number, y: number, width: number, label: string): void {
    const gfx = this.scene.add.graphics();
    drawRoundedRect(
      gfx,
      centerX - width / 2,
      y,
      width,
      PILL_HEIGHT,
      PILL_RADIUS,
      TAB_GREEN,
      TAB_GREEN_BORDER,
      2
    );
    this.add(gfx);

    this.add(
      this.scene.add
        .text(centerX, y + PILL_HEIGHT / 2 - 1, label, {
          fontSize: '18px',
          fontStyle: 'bold',
          color: '#ffffff',
          fontFamily: FREDOKA_FONT,
        })
        .setOrigin(0.5)
    );
  }

  private buildSkeleton(): void {
    for (let i = 0; i < SKELETON_ROWS; i++) {
      const row = this.scene.add.rectangle(
        0,
        i * ROW_HEIGHT + ROW_HEIGHT / 2,
        this.rowWidth,
        ROW_HEIGHT - 8,
        0xe8d4a8,
        0.7
      );
      row.setStrokeStyle(1, DIVIDER_COLOR, 0.6);
      this.skeletonContainer.add(row);
    }
  }

  private bindEvents(): void {
    this.unsubscribers.push(
      eventBus.on('leaderboard:update', (view) => {
        this.render(view);
      })
    );
  }

  private bindScroll(): void {
    let dragStartY = 0;
    let scrollStartY = 0;

    this.contentHitArea?.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      dragStartY = pointer.y;
      scrollStartY = this.scrollY;
    });

    this.contentHitArea?.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!pointer.isDown) return;
      this.setScroll(scrollStartY + (dragStartY - pointer.y));
    });

    this.scene.input.on('wheel', this.wheelHandler);
  }

  private refresh(): void {
    eventBus.emit('leaderboard:refresh', { page: 1 });
  }

  private render(view: LeaderboardView): void {
    const loading = view.status === 'loading';
    const refreshing = view.status === 'refreshing';
    const errored = view.status === 'error';

    this.skeletonContainer.setVisible(loading);
    this.retryButton.setVisible(errored);

    if (refreshing) {
      this.renderRefreshing();
      return;
    }

    this.scene.tweens.killTweensOf(this.listContainer);
    this.listContainer.setAlpha(1);

    if (loading) {
      this.listContainer.removeAll(true);
      this.setScroll(0);
      this.maxScroll = 0;
      this.setStatus(t('common.loading'));
      this.renderMyRank(view);
      return;
    }

    if (errored) {
      this.listContainer.removeAll(true);
      this.setScroll(0);
      this.maxScroll = 0;
      this.setStatus(t(view.error ?? 'leaderboard.error'));
      this.renderMyRank(view);
      return;
    }

    if (view.isEmpty) {
      this.listContainer.removeAll(true);
      this.setScroll(0);
      this.maxScroll = 0;
      this.setStatus(t(view.error ?? 'leaderboard.empty'));
    } else {
      if (view.isStale && view.error) {
        this.setStatus(t(view.error));
      } else {
        this.statusText.setVisible(false);
      }
      this.renderEntries(view);
    }

    this.renderMyRank(view);
  }

  private renderRefreshing(): void {
    this.statusText.setVisible(false);
    this.retryButton.setVisible(false);
    this.skeletonContainer.setVisible(false);
    this.listContainer.setAlpha(REFRESHING_LIST_ALPHA);
  }

  private renderEntries(view: LeaderboardView): void {
    const animate = this.listContainer.length === 0;
    this.listContainer.removeAll(true);

    const entries = view.entries.slice(0, LEADERBOARD_LIMIT);
    entries.forEach((entry, index) => {
      const isMe = !!view.myGuestId && entry.guestId === view.myGuestId;
      this.listContainer.add(this.createEntryRow(entry, index * ROW_HEIGHT + ROW_HEIGHT / 2, isMe));
    });

    this.maxScroll = Math.max(0, entries.length * ROW_HEIGHT - this.listHeight + 8);
    this.setScroll(Math.min(this.scrollY, this.maxScroll));

    this.scene.tweens.killTweensOf(this.listContainer);
    this.listContainer.setAlpha(1);

    if (!animate) return;

    this.listContainer.setAlpha(0.35);
    this.scene.tweens.add({
      alpha: 1,
      duration: 220,
      ease: 'Quad.easeOut',
      targets: this.listContainer,
    });
  }

  private createEntryRow(
    entry: LeaderboardEntry,
    y: number,
    isCurrentPlayer: boolean,
    options: { highlightBg?: boolean } = {}
  ): Phaser.GameObjects.Container {
    const container = this.scene.add.container(0, y);
    const rowHalf = this.rowWidth / 2;
    const highlight = options.highlightBg ?? isCurrentPlayer;

    if (highlight) {
      const bg = this.scene.add.rectangle(0, 0, this.rowWidth, ROW_HEIGHT + 4, ROW_HIGHLIGHT, 1);
      bg.setStrokeStyle(1, PANEL_BORDER, 0.55);
      container.add(bg);
    } else if (entry.rank > 1) {
      const divider = this.scene.add.rectangle(
        0,
        -ROW_HEIGHT / 2 + 2,
        this.rowWidth * 0.92,
        1,
        DIVIDER_COLOR,
        0.55
      );
      container.add(divider);
    }

    container.add(this.createRankBadge(-rowHalf + RANK_COL_WIDTH / 2, 0, entry.rank));

    const nameX = -rowHalf + RANK_COL_WIDTH + 10;
    const nameWrapWidth = Math.max(80, this.rowWidth - RANK_COL_WIDTH - 100);
    const displayName = getLeaderboardDisplayName(entry, t('leaderboard.anonymous'));
    const nameText = this.scene.add
      .text(nameX, 0, displayName, {
        fontSize: '18px',
        fontStyle: 'bold',
        color: TEXT_COLOR,
        fontFamily: FREDOKA_FONT,
        wordWrap: { width: nameWrapWidth },
      })
      .setOrigin(0, 0.5);
    container.add(nameText);

    const scoreText = this.scene.add
      .text(rowHalf - 8, 0, formatScore(entry.bestScore), {
        fontSize: '18px',
        fontStyle: 'bold',
        color: TEXT_COLOR,
        fontFamily: FREDOKA_FONT,
      })
      .setOrigin(1, 0.5);
    container.add(scoreText);

    return container;
  }

  private createRankBadge(x: number, y: number, rank: number): Phaser.GameObjects.Container {
    const badge = this.scene.add.container(x, y);
    const crownKey = CROWN_KEYS[rank as 1 | 2 | 3];

    if (crownKey && this.scene.textures.exists(crownKey)) {
      const crown = this.scene.add.image(0, 0, crownKey);
      crown.setDisplaySize(CROWN_SIZE, CROWN_SIZE);
      badge.add(crown);
      badge.add(
        this.scene.add
          .text(0, 2, String(rank), {
            fontSize: '16px',
            fontStyle: 'bold',
            color: '#1c1b18',
            fontFamily: FREDOKA_FONT,
            stroke: '#ffffff',
            strokeThickness: 4,
          })
          .setOrigin(0.5)
      );
      return badge;
    }

    badge.add(
      this.scene.add
        .text(0, 0, String(rank), {
          fontSize: '20px',
          fontStyle: 'bold',
          color: TEXT_COLOR,
          fontFamily: FREDOKA_FONT,
        })
        .setOrigin(0.5)
    );
    return badge;
  }

  private renderMyRank(view: LeaderboardView): void {
    this.myRankContainer.removeAll(true);

    const selfEntry = this.resolveSelfEntry(view);
    if (!selfEntry) {
      const message =
        view.myBestScore && view.myBestScore > 0
          ? t('leaderboard.localBest', { score: formatScore(view.myBestScore) })
          : t('leaderboard.rankUnavailable');

      this.myRankContainer.add(
        this.scene.add
          .text(0, 0, message, {
            fontSize: '16px',
            color: TEXT_COLOR,
            fontFamily: FREDOKA_FONT,
            align: 'center',
            wordWrap: { width: this.rowWidth - 16 },
          })
          .setOrigin(0.5)
      );
      return;
    }

    this.myRankContainer.add(this.createEntryRow(selfEntry, 0, true, { highlightBg: true }));
  }

  private resolveSelfEntry(view: LeaderboardView): LeaderboardEntry | null {
    if (view.myGuestId) {
      const fromList = view.entries.find((entry) => entry.guestId === view.myGuestId);
      if (fromList) return fromList;
    }

    if (view.myRank && view.myRank > 0 && view.myBestScore !== null) {
      return {
        rank: view.myRank,
        guestId: view.myGuestId ?? 'self',
        bestScore: view.myBestScore,
        name: guest.getName(),
      };
    }

    return null;
  }

  private setScroll(value: number): void {
    this.scrollY = Phaser.Math.Clamp(value, 0, this.maxScroll);
    this.listContainer.setY(this.listBaseY - this.scrollY);
    this.skeletonContainer.setY(this.listBaseY - this.scrollY);
  }

  private setStatus(message: string): void {
    this.statusText.setText(message);
    this.statusText.setVisible(true);
  }
}

function formatScore(score: number): string {
  const locale = i18n.getCurrentLanguage() === 'vi' ? 'vi-VN' : 'en-US';
  return new Intl.NumberFormat(locale).format(Math.floor(score));
}
