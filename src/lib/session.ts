// セッション（1セット=最大20枚）の構成と再挿入付き決定的キュー
import type { VocabCard } from '../types';
import type { CardProgress, Rating } from './schedule';
import { isDue, isMastered, isNew } from './schedule';

export const SET_SIZE = 20; // 1動画の中央値=20語。普通の動画は従来通り1セットでやり切れる
export const REVIEW_LIMIT = 30; // 「今日の復習」の上限。超過分は翌日に無罰で繰り越し

export interface BuiltSet {
  queue: string[]; // cardId列。先頭が次に出るカード
  newCount: number;
  reviewCount: number;
}

export type Rng = () => number;

// Fisher-Yatesシャッフル（rng注入でテスト可能）
export function shuffle<T>(items: T[], rng: Rng = Math.random): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// 学習セットの構成: due到来の復習カード（古い順）を優先し、残り枠を未学習カード（CSV順）で充填→全体シャッフル
export function buildStudySet(
  scopeCards: VocabCard[],
  progress: Record<string, CardProgress>,
  today: number,
  maxSize: number = SET_SIZE,
  rng: Rng = Math.random
): BuiltSet {
  const due = scopeCards
    .filter(c => isDue(progress[c.id], today))
    .sort((a, b) => progress[a.id].due - progress[b.id].due)
    .slice(0, maxSize);

  const remaining = maxSize - due.length;
  const fresh =
    remaining > 0
      ? scopeCards.filter(c => isNew(progress[c.id])).slice(0, remaining)
      : [];

  const queue = shuffle([...due, ...fresh].map(c => c.id), rng);
  return { queue, newCount: fresh.length, reviewCount: due.length };
}

// 「今日の復習」キュー: 全動画横断・due到来のみ・新規は混ぜない・上限あり・古い順
export function buildReviewSet(
  allCards: VocabCard[],
  progress: Record<string, CardProgress>,
  today: number,
  limit: number = REVIEW_LIMIT
): BuiltSet {
  const due = allCards
    .filter(c => isDue(progress[c.id], today))
    .sort((a, b) => progress[a.id].due - progress[b.id].due)
    .slice(0, limit);
  return { queue: due.map(c => c.id), newCount: 0, reviewCount: due.length };
}

// 評価後の再挿入。restQueue は「評価したカードを既に取り除いた」残りキュー。
//  - 覚えてない → 3枚後（近くに戻す）
//  - だいたいOK → 8枚後（遠くに戻す）
//  - 余裕 → 再挿入しない（このセットから卒業）
// 残りが1枚以上あるとき、直前カードが先頭に来ることはない（min(3|8, len) >= 1）。
export function reinsert(restQueue: string[], cardId: string, rating: Rating): string[] {
  if (rating === 'easy') return restQueue;
  const offset = rating === 'again' ? 3 : 8;
  const pos = Math.min(offset, restQueue.length);
  const next = [...restQueue];
  next.splice(pos, 0, cardId);
  return next;
}

// 保存済みキューの再検証: デッキに存在し・スコープに属し・masteredでないカードだけ残す。
// （CSV差し替え・別画面での「覚えた」チェック・スコープ外混入をまとめて塞ぐ）
export function sanitizeQueue(
  queue: string[],
  scopeIds: Set<string>,
  progress: Record<string, CardProgress>
): string[] {
  return queue.filter(id => scopeIds.has(id) && !isMastered(progress[id]));
}

// セットを組んだ場合の枚数だけを安価に数える（シャッフル・配列生成なし。完了画面の「次のセットへ(N枚)」用）
export function availableSetSize(
  scopeCards: VocabCard[],
  progress: Record<string, CardProgress>,
  today: number,
  opts: { reviewOnly?: boolean; max: number }
): number {
  let due = 0;
  let fresh = 0;
  for (const c of scopeCards) {
    const p = progress[c.id];
    if (isDue(p, today)) due++;
    else if (!opts.reviewOnly && isNew(p)) fresh++;
  }
  return Math.min(opts.reviewOnly ? due : due + fresh, opts.max);
}

// day 時点までにdue到来する復習カード数（「今日の復習(N)」「明日N枚」表示用）
export function countDue(
  allCards: VocabCard[],
  progress: Record<string, CardProgress>,
  day: number
): number {
  return allCards.reduce((n, c) => n + (isDue(progress[c.id], day) ? 1 : 0), 0);
}

// 定着（mastered）数
export function countMastered(
  cards: VocabCard[],
  progress: Record<string, CardProgress>
): number {
  return cards.reduce((n, c) => n + (isMastered(progress[c.id]) ? 1 : 0), 0);
}
