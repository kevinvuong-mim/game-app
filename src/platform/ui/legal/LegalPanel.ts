import Phaser from 'phaser';

import {
  PANEL_BG,
  TEXT_COLOR,
  PANEL_BORDER,
  PANEL_CORNER_RADIUS,
  PANEL_LIST_PADDING,
} from '../panel/panelTheme';
import { FREDOKA_FONT } from '@platform/ui/fonts';
import { drawRoundedRect } from '../panel/graphics';
import { createUIButton } from '../button/UIButton';
import { t } from '@platform/modules/i18n/i18n.service';

type LegalTab = 'terms' | 'privacy';

export type { LegalTab };

const TAB_HEIGHT = 52;
const TAB_RADIUS = 18;
/** How far tabs sit down onto the panel so the active tab clearly overlays it. */
const TAB_OVERLAP = 22;
/** Extra space between the overlapping tabs and the scrollable content. */
const CONTENT_TOP_PADDING = 28;
const TAB_INACTIVE = 0x1f6b32;
const TAB_INACTIVE_BORDER = 0x145024;
const CONTENT_TEXT = '#1c1b18';

/**
 * Terms & Privacy tabbed content — Shop/Settings beige panel matching the legal mock.
 */
export class LegalPanel extends Phaser.GameObjects.Container {
  private readonly onBack: () => void;
  private readonly initialTab: LegalTab;
  private readonly wheelHandler: (
    pointer: Phaser.Input.Pointer,
    gameObjects: Phaser.GameObjects.GameObject[],
    deltaX: number,
    deltaY: number
  ) => void;

  private scrollY = 0;
  private maxScroll = 0;
  private contentBaseY = 0;
  private contentWidth = 0;
  private contentHeight = 0;
  private contentCenterY = 0;
  private panelLeft = 0;
  private panelTop = 0;
  private panelWidth = 0;
  private tabWidth = 0;
  private activeTab: LegalTab = 'terms';

  private contentText?: Phaser.GameObjects.Text;
  private contentHitArea?: Phaser.GameObjects.Rectangle;
  private termsTabBg?: Phaser.GameObjects.Graphics;
  private privacyTabBg?: Phaser.GameObjects.Graphics;
  private termsTabHit?: Phaser.GameObjects.Rectangle;
  private privacyTabHit?: Phaser.GameObjects.Rectangle;
  private termsTabLabel?: Phaser.GameObjects.Text;
  private privacyTabLabel?: Phaser.GameObjects.Text;
  private panelGraphics?: Phaser.GameObjects.Graphics;
  private tabSeam?: Phaser.GameObjects.Graphics;
  private contentMaskShape?: Phaser.GameObjects.Graphics;
  private cleanedUp = false;

  constructor(
    scene: Phaser.Scene,
    options: {
      onBack: () => void;
      initialTab?: LegalTab;
    }
  ) {
    super(scene, 0, 0);
    this.onBack = options.onBack;
    this.initialTab = options.initialTab ?? 'terms';
    this.activeTab = this.initialTab;
    this.wheelHandler = (_pointer, _gameObjects, _deltaX, deltaY) => {
      if (!this.contentHitArea?.getBounds().contains(_pointer.x, _pointer.y)) return;
      this.setScroll(this.scrollY + deltaY * 0.5);
    };
    scene.add.existing(this);
    this.build();
    this.selectTab(this.initialTab);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
  }

  destroy(fromScene?: boolean): void {
    this.cleanup();
    super.destroy(fromScene);
  }

  private cleanup(): void {
    if (this.cleanedUp) return;
    this.cleanedUp = true;
    this.scene?.input?.off('wheel', this.wheelHandler);
    this.contentMaskShape?.destroy();
    this.contentMaskShape = undefined;
  }

  private build(): void {
    const { width, height } = this.scene.cameras.main;

    this.panelWidth = Math.min(width * 0.94, 440);
    this.panelLeft = width / 2 - this.panelWidth / 2;
    this.panelTop = height * 0.26;
    const panelHeight = height * 0.62;
    this.tabWidth = this.panelWidth / 2;

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

    this.panelGraphics = this.scene.add.graphics();
    drawRoundedRect(
      this.panelGraphics,
      this.panelLeft,
      this.panelTop,
      this.panelWidth,
      panelHeight,
      PANEL_CORNER_RADIUS,
      PANEL_BG,
      PANEL_BORDER
    );
    this.add(this.panelGraphics);

    this.tabSeam = this.scene.add.graphics();
    this.add(this.tabSeam);
    this.buildTabs();

    // Leave room under the overlapping tabs for readable content.
    const contentTop = this.panelTop + TAB_OVERLAP + CONTENT_TOP_PADDING;
    this.contentWidth = this.panelWidth - PANEL_LIST_PADDING * 2;
    this.contentHeight = panelHeight - (contentTop - this.panelTop) - PANEL_LIST_PADDING;
    this.contentCenterY = contentTop + this.contentHeight / 2;
    this.contentBaseY = contentTop;

    this.contentMaskShape = this.scene.make.graphics({}, false);
    this.contentMaskShape.fillStyle(0xffffff);
    this.contentMaskShape.fillRect(
      this.panelLeft + PANEL_LIST_PADDING,
      contentTop,
      this.contentWidth,
      this.contentHeight
    );
    const mask = this.contentMaskShape.createGeometryMask();

    this.contentText = this.scene.add
      .text(this.panelLeft + PANEL_LIST_PADDING + 4, this.contentBaseY, '', {
        fontSize: '16px',
        color: CONTENT_TEXT,
        fontFamily: FREDOKA_FONT,
        wordWrap: { width: this.contentWidth - 12 },
        lineSpacing: 6,
      })
      .setOrigin(0, 0);
    this.contentText.setMask(mask);
    this.add(this.contentText);

    this.contentHitArea = this.scene.add.rectangle(
      width / 2,
      this.contentCenterY,
      this.contentWidth,
      this.contentHeight,
      0x000000,
      0
    );
    this.contentHitArea.setInteractive({ useHandCursor: true });
    this.add(this.contentHitArea);

    this.bindScroll();
    // Content sits above the panel, but tabs must stay on top of both.
    this.raiseTabs();
  }

  private buildBanner(width: number, height: number): void {
    const bannerY = height * 0.16;
    const banner = this.scene.add.image(width / 2, bannerY, 'shop-banner');
    const targetWidth = Math.min(width * 0.78, 400);
    const targetHeight = banner.height * (targetWidth / banner.width);
    banner.setDisplaySize(targetWidth, targetHeight);
    this.add(banner);

    this.add(
      this.scene.add
        .text(width / 2, bannerY - 14, t('legal.title').toUpperCase(), {
          fontSize: '26px',
          color: '#ffffff',
          fontStyle: 'bold',
          stroke: '#000000',
          strokeThickness: 5,
          fontFamily: FREDOKA_FONT,
          align: 'center',
          wordWrap: { width: targetWidth * 0.8 },
        })
        .setOrigin(0.5)
    );
  }

  private getTabY(): number {
    return this.panelTop - TAB_HEIGHT + TAB_OVERLAP;
  }

  private buildTabs(): void {
    const tabY = this.getTabY();
    const termsX = this.panelLeft + this.tabWidth / 2;
    const privacyX = this.panelLeft + this.panelWidth - this.tabWidth / 2;

    this.termsTabBg = this.scene.add.graphics();
    this.privacyTabBg = this.scene.add.graphics();
    this.add(this.termsTabBg);
    this.add(this.privacyTabBg);

    this.termsTabLabel = this.scene.add
      .text(termsX, tabY + TAB_HEIGHT / 2 - 2, t('legal.tabTerms').toUpperCase(), {
        fontSize: '18px',
        fontStyle: 'bold',
        color: TEXT_COLOR,
        fontFamily: FREDOKA_FONT,
      })
      .setOrigin(0.5);
    this.add(this.termsTabLabel);

    this.privacyTabLabel = this.scene.add
      .text(privacyX, tabY + TAB_HEIGHT / 2 - 2, t('legal.tabPrivacy').toUpperCase(), {
        fontSize: '18px',
        fontStyle: 'bold',
        color: '#ffffff',
        fontFamily: FREDOKA_FONT,
      })
      .setOrigin(0.5);
    this.add(this.privacyTabLabel);

    this.termsTabHit = this.scene.add
      .rectangle(termsX, tabY + TAB_HEIGHT / 2, this.tabWidth, TAB_HEIGHT, 0x000000, 0)
      .setInteractive({ useHandCursor: true });
    this.privacyTabHit = this.scene.add
      .rectangle(privacyX, tabY + TAB_HEIGHT / 2, this.tabWidth, TAB_HEIGHT, 0x000000, 0)
      .setInteractive({ useHandCursor: true });
    this.add(this.termsTabHit);
    this.add(this.privacyTabHit);

    this.termsTabHit.on('pointerdown', () => this.selectTab('terms'));
    this.privacyTabHit.on('pointerdown', () => this.selectTab('privacy'));

    this.drawTabs();
  }

  private drawTabs(): void {
    const tabY = this.getTabY();
    const termsActive = this.activeTab === 'terms';
    const termsX = this.panelLeft;
    const privacyX = this.panelLeft + this.panelWidth - this.tabWidth;

    this.drawTab(this.termsTabBg!, termsX, tabY, this.tabWidth, termsActive);
    this.drawTab(this.privacyTabBg!, privacyX, tabY, this.tabWidth, !termsActive);

    this.termsTabLabel?.setColor(termsActive ? TEXT_COLOR : '#ffffff');
    this.privacyTabLabel?.setColor(termsActive ? '#ffffff' : TEXT_COLOR);

    this.raiseTabs();
  }

  /** Keep tabs above the panel; active tab paints over the inactive one. */
  private raiseTabs(): void {
    const termsActive = this.activeTab === 'terms';

    if (this.panelGraphics) {
      this.moveAbove(this.termsTabBg!, this.panelGraphics);
      this.moveAbove(this.privacyTabBg!, this.panelGraphics);
    }

    if (termsActive) {
      this.bringToTop(this.termsTabBg!);
      this.coverPanelSeam(this.panelLeft, this.tabWidth, PANEL_BG);
    } else {
      this.bringToTop(this.privacyTabBg!);
      this.coverPanelSeam(
        this.panelLeft + this.panelWidth - this.tabWidth,
        this.tabWidth,
        PANEL_BG
      );
    }

    this.bringToTop(this.termsTabLabel!);
    this.bringToTop(this.privacyTabLabel!);
    this.bringToTop(this.termsTabHit!);
    this.bringToTop(this.privacyTabHit!);
  }

  private coverPanelSeam(x: number, width: number, fill: number): void {
    if (!this.tabSeam) return;
    this.tabSeam.clear();
    // Cover the panel's top border under the active tab so it clearly sits on top.
    this.tabSeam.fillStyle(fill, 1);
    this.tabSeam.fillRect(x + 3, this.panelTop - 2, width - 6, 6);
    this.bringToTop(this.tabSeam);
  }

  private drawTab(
    graphics: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    width: number,
    active: boolean
  ): void {
    graphics.clear();
    const fill = active ? PANEL_BG : TAB_INACTIVE;
    const stroke = active ? PANEL_BORDER : TAB_INACTIVE_BORDER;
    const radius = { tl: TAB_RADIUS, tr: TAB_RADIUS, bl: 0, br: 0 };

    graphics.fillStyle(fill, 1);
    graphics.lineStyle(3, stroke, 1);
    graphics.fillRoundedRect(x, y, width, TAB_HEIGHT, radius);
    graphics.strokeRoundedRect(x, y, width, TAB_HEIGHT, radius);

    // Hide the bottom stroke so the tab reads as sitting on the panel.
    graphics.fillStyle(fill, 1);
    graphics.fillRect(x + 2, y + TAB_HEIGHT - 4, width - 4, 8);
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

  private selectTab(tab: LegalTab): void {
    this.activeTab = tab;
    this.scrollY = 0;
    this.drawTabs();

    const contentKey = tab === 'terms' ? 'legal.termsContent' : 'legal.privacyContent';
    this.contentText?.setText(t(contentKey));
    this.contentText?.setY(this.contentBaseY);

    const textHeight = this.contentText?.height ?? 0;
    this.maxScroll = Math.max(0, textHeight - this.contentHeight + 24);
  }

  private setScroll(value: number): void {
    this.scrollY = Phaser.Math.Clamp(value, 0, this.maxScroll);
    this.contentText?.setY(this.contentBaseY - this.scrollY);
  }
}
