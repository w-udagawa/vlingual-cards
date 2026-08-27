import { describe, it, expect } from 'vitest';
import type { VocabCard } from '../../types';
import type { CardProgress } from '../schedule';
import {
  buildStudySet,
  buildReviewSet,
  reinsert,
  sanitizeQueue,
  availableSetSize,
  countDue,
  countMastered,
  SET_SIZE,
} from '../session';

const D = 20000;

const makeCard = (videoId: string, word: string): VocabCard => ({
  id: `${videoId}::${word}`,
  videoId,
  単語: word,
  和訳: `${word}の訳`,
  難易度: '中級',
  品詞: '名詞',
  文脈: `context of ${word}`,
  動画URL: `https://youtu.be/${videoId}`,
});

const cards = (n: number, videoId = 'vid1'): VocabCard[] =>
  Array.from({ length: n }, (_, i) => makeCard(videoId, `word${i}`));

const learning = (due: number): CardProgress => ({
  state: 'learning',
  box: 1,
  due,
  lastRatedDay: due - 1,
  lapses: 0,
});
const mastered: CardProgress = { state: 'mastered', box: 5, due: 0, lastRatedDay: D, lapses: 0 };

// 決定的なrng（シャッフルを恒等にする）
const noShuffle = () => 0.999999;

describe('buildStudySet', () => {
  it('20枚以下の動画は全カードが1セットに入る（従来のやり切り体験）', () => {
    const deck = cards(15);
    const set = buildStudySet(deck, {}, D, SET_SIZE, noShuffle);
    expect(set.queue).toHaveLength(15);
    expect(set.newCount).toBe(15);
    expect(set.reviewCount).toBe(0);
  });

  it('大きい動画は最大20枚に区切られる', () => {
    const deck = cards(304);
    const set = buildStudySet(deck, {}, D, SET_SIZE, noShuffle);
    expect(set.queue).toHaveLength(SET_SIZE);
  });

  it('due復習を古い順に優先し、残り枠を新規で充填する', () => {
    const deck = cards(30);
    const progress: Record<string, CardProgress> = {
      [deck[10].id]: learning(D - 1),
      [deck[20].id]: learning(D - 5), // 一番古い
      [deck[25].id]: learning(D + 3), // まだdueでない
    };
    const set = buildStudySet(deck, progress, D, 5, noShuffle);
    expect(set.reviewCount).toBe(2);
    expect(set.newCount).toBe(3);
    expect(set.queue).toContain(deck[20].id);
    expect(set.queue).toContain(deck[10].id);
    expect(set.queue).not.toContain(deck[25].id);
  });

  it('masteredカードは出題されない', () => {
    const deck = cards(5);
    const progress = { [deck[0].id]: mastered };
    const set = buildStudySet(deck, progress, D, SET_SIZE, noShuffle);
    expect(set.queue).not.toContain(deck[0].id);
    expect(set.queue).toHaveLength(4);
  });

  it('新規もdueもなければ空セット（スコープ完了）', () => {
    const deck = cards(3);
    const progress: Record<string, CardProgress> = {
      [deck[0].id]: mastered,
      [deck[1].id]: learning(D + 2),
      [deck[2].id]: learning(D + 5),
    };
    const set = buildStudySet(deck, progress, D, SET_SIZE, noShuffle);
    expect(set.queue).toHaveLength(0);
  });
});

describe('buildReviewSet', () => {
  it('due到来のみ・新規は混ぜない・古い順・上限あり', () => {
    const deck = cards(50);
    const progress: Record<string, CardProgress> = {};
    for (let i = 0; i < 40; i++) progress[deck[i].id] = learning(D - i);
    const set = buildReviewSet(deck, progress, D, 30);
    expect(set.queue).toHaveLength(30);
    expect(set.newCount).toBe(0);
    // 一番古いdue（D-39）が先頭
    expect(set.queue[0]).toBe(deck[39].id);
  });
});

describe('reinsert', () => {
  const rest = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];

  it('覚えてない → 3枚後に再挿入', () => {
    const next = reinsert(rest, 'X', 'again');
    expect(next.indexOf('X')).toBe(3);
    expect(next).toHaveLength(11);
  });

  it('だいたいOK → 8枚後に再挿入', () => {
    const next = reinsert(rest, 'X', 'ok');
    expect(next.indexOf('X')).toBe(8);
  });

  it('余裕 → 再挿入しない', () => {
    expect(reinsert(rest, 'X', 'easy')).toEqual(rest);
  });

  it('残りが少ないときは末尾へ。ただし残り1枚以上なら先頭には来ない', () => {
    expect(reinsert(['a'], 'X', 'again')).toEqual(['a', 'X']);
    expect(reinsert(['a', 'b'], 'X', 'ok')).toEqual(['a', 'b', 'X']);
  });

  it('残り0枚（最後の1枚を覚えてない）→ そのカードだけが再度出る', () => {
    expect(reinsert([], 'X', 'again')).toEqual(['X']);
  });
});

describe('sanitizeQueue（保存済みセッションの復帰検証）', () => {
  const deck = cards(5);
  const scopeIds = new Set(deck.map(c => c.id));

  it('mastered・スコープ外・デッキから消えたIDを除外する', () => {
    const progress: Record<string, CardProgress> = { [deck[1].id]: mastered };
    const queue = [deck[0].id, deck[1].id, 'otherVid::gone', deck[2].id];
    expect(sanitizeQueue(queue, scopeIds, progress)).toEqual([deck[0].id, deck[2].id]);
  });

  it('問題がなければそのまま', () => {
    const queue = [deck[0].id, deck[1].id];
    expect(sanitizeQueue(queue, scopeIds, {})).toEqual(queue);
  });
});

describe('availableSetSize（完了画面の「次のセットへ(N枚)」）', () => {
  const deck = cards(50);

  it('学習スコープ: due+新規をSET_SIZEで打ち切る', () => {
    const progress: Record<string, CardProgress> = { [deck[0].id]: learning(D - 1) };
    expect(availableSetSize(deck, progress, D, { max: SET_SIZE })).toBe(SET_SIZE);
  });

  it('復習スコープ: dueのみ数え新規を含めない', () => {
    const progress: Record<string, CardProgress> = {
      [deck[0].id]: learning(D - 1),
      [deck[1].id]: learning(D),
      [deck[2].id]: learning(D + 3), // まだ
    };
    expect(availableSetSize(deck, progress, D, { reviewOnly: true, max: 30 })).toBe(2);
  });

  it('何も残っていなければ0（buildStudySetの結果と一致する）', () => {
    const progress: Record<string, CardProgress> = {};
    const small = cards(3);
    small.forEach(c => { progress[c.id] = mastered; });
    expect(availableSetSize(small, progress, D, { max: SET_SIZE })).toBe(0);
    expect(buildStudySet(small, progress, D, SET_SIZE, noShuffle).queue).toHaveLength(0);
  });
});

describe('countDue / countMastered', () => {
  it('明日dueのカードを数えられる（完了画面の「明日N枚」）', () => {
    const deck = cards(5);
    const progress: Record<string, CardProgress> = {
      [deck[0].id]: learning(D + 1),
      [deck[1].id]: learning(D + 1),
      [deck[2].id]: learning(D - 2), // 今日の残り（明日にも含まれる）
      [deck[3].id]: mastered,
    };
    expect(countDue(deck, progress, D + 1)).toBe(3);
    expect(countDue(deck, progress, D)).toBe(1);
    expect(countMastered(deck, progress)).toBe(1);
  });
});
