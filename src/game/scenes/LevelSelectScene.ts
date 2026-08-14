import Phaser from 'phaser';

import { t, toast } from '@platform/ui';
import { eventBus } from '@platform/core/events';
import { FREDOKA_FONT } from '@platform/ui/fonts';
import { createUIButton } from '@platform/ui/button/UIButton';
import { drawRoundedRect } from '@platform/ui/panel/graphics';
import { PANEL_BG, PANEL_BORDER, PANEL_CORNER_RADIUS } from '@platform/ui/panel/panelTheme';
import { getMapDefinition, mapBackgroundKey } from '@game/campaign/mapConfig';
import {
  getLastMapId,
  getLevelStars,
  isLevelPlayable,
  isMapUnlocked,
  setLastMapId,
} from '@game/campaign/progress';

const GRID_COLS = 3;
const BOX_SIZE = 124;
const BOX_GAP_X = 22;
const BOX_GAP_Y = 16;
const ROW_STRIDE = BOX_SIZE + BOX_GAP_Y + 6;
const PANEL_PAD = 24;
const VISIBLE_ROWS = 5;
const DRAG_THRESHOLD = 8;

export class LevelSelectScene extends Phaser.Scene {
  private mapId = 1;
  private returnTo = 'Map';
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
    super({ key: 'LevelSelect' });
  }

  init(data: { mapId?: number; returnTo?: string } = {}): void {
    this.returnTo = data.returnTo ?? 'Map';
    this.mapId = data.mapId ?? getLastMapId();
  }

  create(): void {
    this.cleanupEventListeners();
    this.events.off('shutdown', this.shutdown, this);
    this.events.once('shutdown', this.shutdown, this);

    eventBus.emit('ad:context:change', { context: 'HOME' });
    this.renderLevels();

    this.unsubscribers.push(
      eventBus.on('app:back', () => {
        this.scene.start(this.returnTo, { returnTo: 'Home' });
      })
    );
  }

  shutdown(): void {
    this.cleanupScroll();
    this.cleanupEventListeners();
  }

  private renderLevels(): void {
    this.cleanupScroll();
    this.children.removeAll(true);
    setLastMapId(this.mapId);
    this.scrollY = 0;

    const { width, height } = this.cameras.main;
    const map = getMapDefinition(this.mapId);
    const unlocked = isMapUnlocked(this.mapId);

    this.addBackground(width, height);

    createUIButton({
      scene: this,
      position: { x: width * 0.17, y: height * 0.08 },
      size: { width: 72, height: 72 },
      background: { key: 'back-icon' },
      onClick: () => this.scene.start(this.returnTo, { returnTo: 'Home' }),
    });

    this.addBanner(width, height, map.bannerName);

    const rows = Math.ceil(map.levelCount / GRID_COLS);
    const gridW = GRID_COLS * BOX_SIZE + (GRID_COLS - 1) * BOX_GAP_X;
    const contentH = (rows - 1) * ROW_STRIDE + BOX_SIZE;
    const maxViewportH = (VISIBLE_ROWS - 1) * ROW_STRIDE + BOX_SIZE;
    const viewportH = Math.min(contentH, maxViewportH);
    const gridX = width / 2 - gridW / 2;
    const gridY = height * 0.28;
    this.gridOriginX = gridX + BOX_SIZE / 2;
    this.gridOriginY = gridY + BOX_SIZE / 2;
    this.viewport = { x: gridX, y: gridY, width: gridW, height: viewportH };
    this.maxScroll = Math.max(0, contentH - viewportH);

    this.drawGridPanel(gridX, gridY, gridW, viewportH);

    this.contentMaskShape = this.make.graphics({ x: 0, y: 0 }, false);
    this.contentMaskShape.fillStyle(0xffffff);
    this.contentMaskShape.fillRoundedRect(
      gridX - PANEL_PAD,
      gridY - PANEL_PAD,
      gridW + PANEL_PAD * 2,
      viewportH + PANEL_PAD * 2,
      PANEL_CORNER_RADIUS
    );

    this.listContainer = this.add.container(0, 0).setDepth(1);
    this.listContainer.setMask(this.contentMaskShape.createGeometryMask());

    for (let i = 0; i < map.levelCount; i += 1) {
      const col = i % GRID_COLS;
      const row = Math.floor(i / GRID_COLS);
      const x = this.gridOriginX + col * (BOX_SIZE + BOX_GAP_X);
      const y = this.gridOriginY + row * ROW_STRIDE;
      this.addLevelBox(this.listContainer, x, y, i, unlocked);
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
    const map = getMapDefinition(this.mapId);
    const unlocked = isMapUnlocked(this.mapId);
    const contentY = pointerY + this.scrollY;

    for (let i = 0; i < map.levelCount; i += 1) {
      const col = i % GRID_COLS;
      const row = Math.floor(i / GRID_COLS);
      const x = this.gridOriginX + col * (BOX_SIZE + BOX_GAP_X);
      const y = this.gridOriginY + row * ROW_STRIDE;
      if (Math.abs(pointerX - x) <= BOX_SIZE / 2 && Math.abs(contentY - y) <= BOX_SIZE / 2) {
        this.onLevelTap(i, unlocked, unlocked && isLevelPlayable(this.mapId, i));
        return;
      }
    }
  }

  private addLevelBox(
    container: Phaser.GameObjects.Container,
    x: number,
    y: number,
    levelIndex: number,
    mapUnlocked: boolean
  ): void {
    const stars = getLevelStars(this.mapId, levelIndex);
    const played = stars > 0;
    const playable = mapUnlocked && isLevelPlayable(this.mapId, levelIndex);
    const box = this.add.image(x, y, played ? 'box-active' : 'box-inactive');
    box.setDisplaySize(BOX_SIZE, BOX_SIZE);
    if (!playable) box.setAlpha(0.72);

    const label = this.add
      .text(x, y - 12, String(levelIndex + 1), {
        fontFamily: FREDOKA_FONT,
        fontSize: '40px',
        fontStyle: 'bold',
        color: played ? '#3a2a10' : '#6a6a6a',
        stroke: played ? '#fff3d0' : '#2a2a2a',
        strokeThickness: 3,
      })
      .setOrigin(0.5);

    const starY = y + 28;
    const starKeys = played
      ? [0, 1, 2].map((i) => (i < stars ? 'star-active' : 'star-inactive'))
      : ['star-grey', 'star-grey', 'star-grey'];
    const starImages = starKeys.map((key, i) => {
      const star = this.add.image(x + (i - 1) * 28, starY, key);
      star.setDisplaySize(22, 22);
      return star;
    });

    container.add([box, label, ...starImages]);
  }

  private onLevelTap(levelIndex: number, mapUnlocked: boolean, playable: boolean): void {
    if (!mapUnlocked) {
      toast.show({ message: t('map.mapLocked'), type: 'warning' });
      return;
    }
    if (!playable) {
      toast.show({ message: t('map.levelLocked'), type: 'warning' });
      return;
    }
    this.scene.start('Gameplay', {
      mode: 'campaign',
      mapId: this.mapId,
      levelIndex,
      returnTo: 'LevelSelect',
    });
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
    const bannerY = height * 0.18;
    const banner = this.add.image(width / 2, bannerY, 'shop-banner');
    const targetWidth = Math.min(width * 0.72, 360);
    const targetHeight = banner.height * (targetWidth / banner.width);
    banner.setDisplaySize(targetWidth, targetHeight);

    this.add
      .text(width / 2, bannerY - 16, title, {
        fontFamily: FREDOKA_FONT,
        fontSize: '40px',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 5,
      })
      .setOrigin(0.5);
  }

  private addBackground(width: number, height: number): void {
    const bg = this.add.image(width / 2, height / 2, mapBackgroundKey(this.mapId));
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
