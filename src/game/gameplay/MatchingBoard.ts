import Phaser from 'phaser';

import { CardView } from './CardView';
import { gridForCellCount, type GridSize } from '@game/campaign/mapConfig';

interface BoardSlot {
  index: number;
  x: number;
  y: number;
}

export interface MatchingBoardLayout {
  cardSize: number;
  slots: BoardSlot[];
  bounds: { x: number; y: number; width: number; height: number };
}

export function layoutMatchingBoard(
  cellCount: number,
  area: { x: number; y: number; width: number; height: number },
  grid?: GridSize
): MatchingBoardLayout {
  const { cols, rows } = grid ?? gridForCellCount(cellCount);
  const gap = 16;
  const maxW = (area.width - gap * (cols + 1)) / cols;
  const maxH = (area.height - gap * (rows + 1)) / rows;
  const cardSize = Math.max(64, Math.round(Math.min(146, maxW, maxH) * 0.94));
  const gridW = cols * cardSize + (cols - 1) * gap;
  const gridH = rows * cardSize + (rows - 1) * gap;
  const gridX = area.x + (area.width - gridW) / 2;
  const gridY = area.y + (area.height - gridH) / 2;
  const originX = gridX + cardSize / 2;
  const originY = gridY + cardSize / 2;

  const slots: BoardSlot[] = [];
  for (let i = 0; i < cellCount; i += 1) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    slots.push({
      index: i,
      x: originX + col * (cardSize + gap),
      y: originY + row * (cardSize + gap),
    });
  }

  return { cardSize, slots, bounds: { x: gridX, y: gridY, width: gridW, height: gridH } };
}

function shuffleInPlace<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = items[i];
    items[i] = items[j];
    items[j] = tmp;
  }
  return items;
}

/** Non-mutating shuffle — copy then shuffle in place. */
export function shuffled<T>(items: readonly T[]): T[] {
  return shuffleInPlace([...items]);
}

export function buildPairDeck(pairKeys: string[]): string[] {
  const deck: string[] = [];
  for (const key of pairKeys) {
    deck.push(key, key);
  }
  return shuffleInPlace(deck);
}

export function createCards(
  scene: Phaser.Scene,
  layout: MatchingBoardLayout,
  deck: string[]
): CardView[] {
  return layout.slots.map((slot, index) => {
    const card = new CardView(scene, slot.x, slot.y, layout.cardSize, deck[index], slot.index);
    card.setDepth(10);
    return card;
  });
}

export function findMatchingPair(cards: CardView[]): [CardView, CardView] | null {
  for (let i = 0; i < cards.length; i += 1) {
    for (let j = i + 1; j < cards.length; j += 1) {
      if (cards[i].pairKey === cards[j].pairKey) {
        return [cards[i], cards[j]];
      }
    }
  }
  return null;
}

function remainingPairs(cards: CardView[]): Map<string, CardView[]> {
  const groups = new Map<string, CardView[]>();
  for (const card of cards) {
    if (card.matched) continue;
    const list = groups.get(card.pairKey) ?? [];
    list.push(card);
    groups.set(card.pairKey, list);
  }
  return groups;
}

export function pickRandomRemainingPair(cards: CardView[]): [CardView, CardView] | null {
  const complete: Array<[CardView, CardView]> = [];
  for (const group of remainingPairs(cards).values()) {
    if (group.length >= 2) {
      complete.push([group[0], group[1]]);
    }
  }
  if (complete.length === 0) return null;
  return complete[Math.floor(Math.random() * complete.length)];
}
