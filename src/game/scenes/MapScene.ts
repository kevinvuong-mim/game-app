import Phaser from 'phaser';

import { t, toast } from '@platform/ui';
import { eventBus } from '@platform/core/events';
import { FREDOKA_FONT } from '@platform/ui/fonts';
import { createUIButton } from '@platform/ui/button/UIButton';
import { drawRoundedRect } from '@platform/ui/panel/graphics';
import { PANEL_BG, PANEL_BORDER, PANEL_CORNER_RADIUS } from '@platform/ui/panel/panelTheme';
import {
  MAP_COUNT,
  getAllMaps,
  getMapDefinition,
  mapBackgroundKey,
} from '@game/campaign/mapConfig';
import {
  getLastMapId,
  getMapTotalStars,
  isMapUnlocked,
  setLastMapId,
} from '@game/campaign/progress';

const GRID_COLS = 2;
const CARD_W = 200;
const CARD_H = 360;
const CARD_GAP_X = 28;
const CARD_GAP_Y = 24;
const ROW_STRIDE = CARD_H + CARD_GAP_Y;
const PANEL_PAD = 32;
const VISIBLE_ROWS = 2;
const DRAG_THRESHOLD = 8;
const THUMB_W = CARD_W - 16;
const THUMB_H = 248;
const CARD_INNER_PAD = 14;
const SECTION_GAP = 14;

export class MapScene extends Phaser.Scene {
  private returnTo = 'Home';
  private scrollY = 0;
  private maxScroll = 0;
  private dragStartY = 0;
  private scrollStartY = 0;
  private dragMoved = false;
  private gridOriginX = 0;
  private gridOriginY = 0;
  private viewport = { x: 0, y: 0, width: 0, height: 0 };
  private listContainer?: Phaser.GameObjects.Container;
  private contentMaskShape?: Phaser.GameObjects.Graphics;
  private unsubscribers: Array<() => void> = [];

  constructor() {
    super({ key: 'Map' });
  }

  init(data: { returnTo?: string } = {}): void {
    this.returnTo = data.returnTo ?? 'Home';
  }

  create(): void {
    this.cleanupEventListeners();
    this.events.off('shutdown', this.shutdown, this);
    this.events.once('shutdown', this.shutdown, this);

    eventBus.emit('ad:context:change', { context: 'HOME' });
    this.renderMaps();

    this.unsubscribers.push(
      eventBus.on('app:back', () => {
        this.scene.start(this.returnTo);
      })
    );
  }

  shutdown(): void {
    this.cleanupScroll();
    this.cleanupEventListeners();
  }

  private renderMaps(): void {
    this.cleanupScroll();
    this.children.removeAll(true);
    this.scrollY = 0;

    const { width, height } = this.cameras.main;
    this.addBackground(width, height);

    createUIButton({
      scene: this,
      position: { x: width * 0.17, y: height * 0.08 },
      size: { width: 72, height: 72 },
      background: { key: 'back-icon' },
      onClick: () => this.scene.start(this.returnTo),
    });

    this.addBanner(width, height, t('map.selectTitle'));

    const maps = getAllMaps();
    const rows = Math.ceil(maps.length / GRID_COLS);
    const gridW = GRID_COLS * CARD_W + (GRID_COLS - 1) * CARD_GAP_X;
    const contentH = (rows - 1) * ROW_STRIDE + CARD_H;
    const viewportH = Math.min(contentH, (VISIBLE_ROWS - 1) * ROW_STRIDE + CARD_H);
    const gridX = width / 2 - gridW / 2;
    const gridY = height * 0.26;
    this.gridOriginX = gridX + CARD_W / 2;
    this.gridOriginY = gridY + CARD_H / 2;
    this.viewport = { x: gridX, y: gridY, width: gridW, height: viewportH };
    this.maxScroll = Math.max(0, contentH - viewportH);

    this.drawGridPanel(gridX, gridY, gridW, viewportH);

    // Clip to the inner content area so panel padding stays empty while scrolling.
    this.contentMaskShape = this.make.graphics({ x: 0, y: 0 }, false);
    this.contentMaskShape.fillStyle(0xffffff);
    this.contentMaskShape.fillRoundedRect(
      gridX,
      gridY,
      gridW,
      viewportH,
      Math.max(8, PANEL_CORNER_RADIUS - PANEL_PAD)
    );

    this.listContainer = this.add.container(0, 0).setDepth(1);
    this.listContainer.setMask(this.contentMaskShape.createGeometryMask());

    for (let i = 0; i < maps.length; i += 1) {
      const col = i % GRID_COLS;
      const row = Math.floor(i / GRID_COLS);
      const x = this.gridOriginX + col * (CARD_W + CARD_GAP_X);
      const y = this.gridOriginY + row * ROW_STRIDE;
      this.addMapCard(this.listContainer, x, y, maps[i].id);
    }

    this.bindGridScroll();
  }

  private bindGridScroll(): void {
    const { x, y, width, height } = this.viewport;
    const hit = this.add
      .rectangle(
        x + width / 2,
        y + height / 2,
        width + PANEL_PAD * 2,
        height + PANEL_PAD * 2,
        0x000000,
        0
      )
      .setInteractive()
      .setDepth(4);

    hit.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.dragStartY = pointer.y;
      this.scrollStartY = this.scrollY;
      this.dragMoved = false;
    });

    hit.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!pointer.isDown) return;
      const dy = this.dragStartY - pointer.y;
      if (Math.abs(dy) > DRAG_THRESHOLD) this.dragMoved = true;
      this.setScroll(this.scrollStartY + dy);
    });

    hit.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (this.dragMoved) return;
      this.handleGridTap(pointer.x, pointer.y);
    });

    this.input.on('wheel', this.onWheel, this);
  }

  private onWheel(
    pointer: Phaser.Input.Pointer,
    _gameObjects: Phaser.GameObjects.GameObject[],
    _deltaX: number,
    deltaY: number
  ): void {
    const { x, y, width, height } = this.viewport;
    if (pointer.x < x || pointer.x > x + width || pointer.y < y || pointer.y > y + height) {
      return;
    }
    this.setScroll(this.scrollY + deltaY * 0.5);
  }

  private setScroll(value: number): void {
    this.scrollY = Phaser.Math.Clamp(value, 0, this.maxScroll);
    this.listContainer?.setY(-this.scrollY);
  }

  private handleGridTap(pointerX: number, pointerY: number): void {
    const contentY = pointerY + this.scrollY;

    for (let i = 0; i < MAP_COUNT; i += 1) {
      const col = i % GRID_COLS;
      const row = Math.floor(i / GRID_COLS);
      const x = this.gridOriginX + col * (CARD_W + CARD_GAP_X);
      const y = this.gridOriginY + row * ROW_STRIDE;
      if (Math.abs(pointerX - x) <= CARD_W / 2 && Math.abs(contentY - y) <= CARD_H / 2) {
        this.onMapTap(i + 1);
        return;
      }
    }
  }

  private addMapCard(
    container: Phaser.GameObjects.Container,
    x: number,
    y: number,
    mapId: number
  ): void {
    const unlocked = isMapUnlocked(mapId);
    const map = getMapDefinition(mapId);
    const totalStars = getMapTotalStars(mapId);
    const maxStars = map.levelCount * 3;
    const lastMapId = getLastMapId();

    const cardBg = this.add.graphics();
    drawRoundedRect(
      cardBg,
      x - CARD_W / 2,
      y - CARD_H / 2,
      CARD_W,
      CARD_H,
      16,
      PANEL_BG,
      lastMapId === mapId ? 0xe8a838 : PANEL_BORDER
    );

    const top = y - CARD_H / 2;
    const titleY = top + CARD_INNER_PAD + 14;
    const thumbTop = top + CARD_INNER_PAD + 28 + SECTION_GAP;
    const thumbY = thumbTop + THUMB_H / 2;
    const starsY = thumbTop + THUMB_H + SECTION_GAP + 11;
    const thumb = this.add.image(x, thumbY, mapBackgroundKey(mapId));
    this.fitThumbCover(thumb);

    const title = this.add
      .text(x, titleY, map.bannerName, {
        fontFamily: FREDOKA_FONT,
        fontSize: '26px',
        fontStyle: 'bold',
        color: unlocked ? '#3a2a10' : '#6a6a6a',
        stroke: '#fff3d0',
        strokeThickness: 3,
      })
      .setOrigin(0.5);

    if (!unlocked) {
      thumb.setTint(0x555555);
      const lockOverlay = this.add.rectangle(x, thumbY, THUMB_W, THUMB_H, 0x000000, 0.25);
      const lockIcon = this.makeLockIcon(x, thumbY);
      container.add([cardBg, title, thumb, lockOverlay, lockIcon]);
    } else {
      container.add([cardBg, title, thumb]);
    }

    const starIcon = this.add.image(x - 28, starsY, unlocked ? 'star-active' : 'star-grey');
    starIcon.setDisplaySize(22, 22);

    const starsLabel = this.add
      .text(x + 4, starsY, t('map.stars', { earned: totalStars, max: maxStars }), {
        fontFamily: FREDOKA_FONT,
        fontSize: '18px',
        fontStyle: 'bold',
        color: unlocked ? '#3a2a10' : '#6a6a6a',
        stroke: '#fff3d0',
        strokeThickness: 2,
      })
      .setOrigin(0, 0.5);

    if (!unlocked) {
      cardBg.setAlpha(0.85);
      title.setAlpha(0.85);
      starIcon.setAlpha(0.7);
      starsLabel.setAlpha(0.7);
    }

    container.add([starIcon, starsLabel]);
  }

  private fitThumbCover(thumb: Phaser.GameObjects.Image): void {
    const scale = Math.max(THUMB_W / thumb.width, THUMB_H / thumb.height);
    const cropW = THUMB_W / scale;
    const cropH = THUMB_H / scale;
    thumb.setCrop((thumb.width - cropW) / 2, (thumb.height - cropH) / 2, cropW, cropH);
    thumb.setScale(scale);
  }

  private makeLockIcon(x: number, y: number): Phaser.GameObjects.Graphics {
    const g = this.add.graphics();
    g.lineStyle(5, 0xffffff, 0.95);
    g.strokeRoundedRect(x - 14, y - 4, 28, 22, 4);
    g.beginPath();
    g.arc(x, y - 4, 12, Math.PI, 0, false);
    g.strokePath();
    g.fillStyle(0xffffff, 0.95);
    g.fillCircle(x, y + 6, 3);
    return g;
  }

  private onMapTap(mapId: number): void {
    if (!isMapUnlocked(mapId)) {
      toast.show({ message: t('map.mapLocked'), type: 'warning' });
      return;
    }
    setLastMapId(mapId);
    this.scene.start('LevelSelect', { mapId, returnTo: 'Map' });
  }

  private drawGridPanel(x: number, y: number, gridW: number, gridH: number): void {
    const panel = this.add.graphics().setDepth(0);
    drawRoundedRect(
      panel,
      x - PANEL_PAD,
      y - PANEL_PAD,
      gridW + PANEL_PAD * 2,
      gridH + PANEL_PAD * 2,
      PANEL_CORNER_RADIUS,
      PANEL_BG,
      PANEL_BORDER
    );
  }

  private addBanner(width: number, height: number, title: string): void {
    const bannerY = height * 0.16;
    const banner = this.add.image(width / 2, bannerY, 'shop-banner');
    const targetWidth = Math.min(width * 0.72, 360);
    const targetHeight = banner.height * (targetWidth / banner.width);
    banner.setDisplaySize(targetWidth, targetHeight);

    this.add
      .text(width / 2, bannerY - 16, title, {
        fontFamily: FREDOKA_FONT,
        fontSize: '36px',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 5,
      })
      .setOrigin(0.5);
  }

  private addBackground(width: number, height: number): void {
    const bgKey = this.textures.exists('general-background-image')
      ? 'general-background-image'
      : mapBackgroundKey(getLastMapId());
    const bg = this.add.image(width / 2, height / 2, bgKey);
    const scale = Math.max(width / bg.width, height / bg.height);
    bg.setScale(scale).setDepth(-1);
  }

  private cleanupScroll(): void {
    this.input?.off('wheel', this.onWheel, this);
    this.contentMaskShape?.destroy();
    this.contentMaskShape = undefined;
    this.listContainer = undefined;
  }

  private cleanupEventListeners(): void {
    for (const unsub of this.unsubscribers) unsub();
    this.unsubscribers = [];
  }
}
