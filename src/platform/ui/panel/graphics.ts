import Phaser from 'phaser';

export function drawRoundedRect(
  graphics: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fill: number,
  stroke: number,
  strokeWidth = 3
): void {
  graphics.fillStyle(fill, 1);
  graphics.lineStyle(strokeWidth, stroke, 1);
  graphics.fillRoundedRect(x, y, width, height, radius);
  graphics.strokeRoundedRect(x, y, width, height, radius);
}

export function measureTextWidth(
  scene: Phaser.Scene,
  content: string,
  style: Phaser.Types.GameObjects.Text.TextStyle
): number {
  const probe = scene.add.text(0, 0, content, style).setVisible(false);
  const width = Math.ceil(probe.width);
  probe.destroy();
  return width;
}
