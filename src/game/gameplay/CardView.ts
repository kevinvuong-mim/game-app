import Phaser from 'phaser';

const FLIP_MS = 140;

export class CardView extends Phaser.GameObjects.Container {
  readonly pairKey: string;
  slotIndex: number;
  faceUp = false;
  matched = false;
  flipping = false;

  private readonly back: Phaser.GameObjects.Image;
  private readonly front: Phaser.GameObjects.Container;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    cardSize: number,
    pairKey: string,
    slotIndex: number
  ) {
    super(scene, x, y);
    this.pairKey = pairKey;
    this.slotIndex = slotIndex;

    this.back = scene.add.image(0, 0, 'card-back');
    this.back.setDisplaySize(cardSize, cardSize);

    this.front = scene.add.container(0, 0);
    const frame = scene.add.image(0, 0, 'card-front');
    frame.setDisplaySize(cardSize, cardSize);
    const art = scene.add.image(0, 0, pairKey);
    const artSize = cardSize * 0.62;
    const scale = Math.min(artSize / art.width, artSize / art.height);
    art.setDisplaySize(art.width * scale, art.height * scale);
    this.front.add([frame, art]);
    this.front.setVisible(false);

    this.add([this.back, this.front]);
    this.setSize(cardSize, cardSize);
    this.setInteractive({ useHandCursor: true });
    scene.add.existing(this);
  }

  get isBusy(): boolean {
    return this.flipping || this.matched;
  }

  async flipTo(face: 'front' | 'back'): Promise<void> {
    if (this.matched || !this.active) return;
    const showFront = face === 'front';
    if (this.faceUp === showFront && !this.flipping) return;

    this.flipping = true;
    this.scene.tweens.killTweensOf(this);
    this.setScale(Math.abs(this.scaleY) || 1);

    try {
      await tweenScaleX(this.scene, this, 0, FLIP_MS);
      if (!this.active || this.matched) return;

      this.faceUp = showFront;
      this.back.setVisible(!showFront);
      this.front.setVisible(showFront);

      await tweenScaleX(this.scene, this, 1, FLIP_MS);
    } finally {
      this.flipping = false;
    }
  }

  async playMatchClear(): Promise<void> {
    this.matched = true;
    this.flipping = false;
    this.disableInteractive();
    this.scene.tweens.killTweensOf(this);
    await new Promise<void>((resolve) => {
      if (!this.active || !this.scene.sys?.isActive()) {
        resolve();
        return;
      }
      this.scene.tweens.add({
        targets: this,
        alpha: 0,
        scale: 0.7,
        duration: 220,
        ease: 'Back.In',
        onComplete: () => resolve(),
      });
    });
    if (this.active) this.destroy();
  }
}

function tweenScaleX(
  scene: Phaser.Scene,
  target: Phaser.GameObjects.GameObject,
  scaleX: number,
  duration: number
): Promise<void> {
  return new Promise((resolve) => {
    if (!scene.sys?.isActive()) {
      resolve();
      return;
    }
    scene.tweens.add({
      targets: target,
      scaleX,
      duration,
      ease: 'Sine.InOut',
      onComplete: () => resolve(),
    });
  });
}
