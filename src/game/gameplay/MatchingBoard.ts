import Phaser from 'phaser';

import { CardView } from './CardView';
import {
  BOARD_CARD_FILL,
  BOARD_CARD_HEIGHT_FILL,
  BOARD_SIZE_ROWS,
  gridForCellCount,
  type GridSize,
} from '@game/campaign/mapConfig';

interface BoardSlot {
  index: number;
  x: number;
  y: number;
}

export interface MatchingBoardLayout {
  cardWidth: number;
  cardHeight: number;
  slots: BoardSlot[];
  bounds: { x: number; y: number; width: number; height: number };
}

export function layoutMatchingBoard(
  cellCount: number,
  area: { x: number; y: number; width: number; height: number },
  grid?: GridSize,
  options?: { fill?: number; heightFill?: number; sizeRows?: number }
): MatchingBoardLayout {
  const { cols, rows } = grid ?? gridForCellCount(cellCount);
  const fill = options?.fill ?? BOARD_CARD_FILL;
  const heightFill = options?.heightFill ?? BOARD_CARD_HEIGHT_FILL;
  const sizeRows = options?.sizeRows ?? BOARD_SIZE_ROWS;
  const gap = 16;
  const maxW = (area.width - gap * (cols + 1)) / cols;
  const maxH = (area.height - gap * (sizeRows + 1)) / sizeRows;
  const cardWidth = Math.max(64, Math.round(Math.min(146, maxW) * fill));
  const cardHeight = Math.max(cardWidth, Math.round(maxH * heightFill));
  const gridW = cols * cardWidth + (cols - 1) * gap;
  const gridH = rows * cardHeight + (rows - 1) * gap;
  const gridX = area.x + (area.width - gridW) / 2;
  const gridY = area.y + (area.height - gridH) / 2;
  const originX = gridX + cardWidth / 2;
  const originY = gridY + cardHeight / 2;

  const slots: BoardSlot[] = [];
  for (let i = 0; i < cellCount; i += 1) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cardsInRow = Math.min(cols, cellCount - row * cols);
    const rowOffset = ((cols - cardsInRow) * (cardWidth + gap)) / 2;
    slots.push({
      index: i,
      x: originX + col * (cardWidth + gap) + rowOffset,
      y: originY + row * (cardHeight + gap),
    });
  }

  return {
    cardWidth,
    cardHeight,
    slots,
    bounds: { x: gridX, y: gridY, width: gridW, height: gridH },
  };
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
    const card = new CardView(
      scene,
      slot.x,
      slot.y,
      layout.cardWidth,
      layout.cardHeight,
      deck[index],
      slot.index
    );
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
