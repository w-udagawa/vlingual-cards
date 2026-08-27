import { describe, it, expect } from 'vitest';
import {
  applyRating,
  isDue,
  isMastered,
  isNew,
  setMasteredManually,
  setUnlearnedManually,
  todayLocal,
  INTERVALS,
  type CardProgress,
} from '../schedule';

const D = 20000; // 適当な基準日

const learning = (box: number, due: number, lastRatedDay: number, lapses = 0): CardProgress => ({
  state: 'learning',
  box,
  due,
  lastRatedDay,
  lapses,
});

describe('applyRating: 新規カード', () => {
  it('覚えてない → 箱1、翌日due', () => {
    expect(applyRating(undefined, 'again', D)).toEqual(learning(1, D + 1, D, 0));
  });
  it('だいたいOK → 箱1、翌日due', () => {
    expect(applyRating(undefined, 'ok', D)).toEqual(learning(1, D + 1, D, 0));
  });
  it('余裕 → 箱2へスキップ、3日後due', () => {
    expect(applyRating(undefined, 'easy', D)).toEqual(learning(2, D + 3, D, 0));
  });
  it('newのtombstoneレコードも未学習として扱う', () => {
    const tombstone: CardProgress = { state: 'new', box: 0, due: 0, lastRatedDay: D - 5, lapses: 2 };
    expect(applyRating(tombstone, 'easy', D)).toEqual(learning(2, D + 3, D, 0));
  });
});

describe('applyRating: learningカード（初回評価の日）', () => {
  it('覚えてない → 箱1へ降格 + lapses+1', () => {
    const prev = learning(4, D, D - 14, 1);
    expect(applyRating(prev, 'again', D)).toEqual(learning(1, D + 1, D, 2));
  });
  it('だいたいOK → 同じ箱で間隔リピート（昇格しない）', () => {
    const prev = learning(3, D, D - 7, 0);
    expect(applyRating(prev, 'ok', D)).toEqual(learning(3, D + INTERVALS[3], D, 0));
  });
  it('余裕 → 箱+1', () => {
    const prev = learning(2, D, D - 3, 0);
    expect(applyRating(prev, 'easy', D)).toEqual(learning(3, D + INTERVALS[3], D, 0));
  });
  it('箱5を余裕で通過 → mastered', () => {
    const prev = learning(5, D, D - 30, 1);
    const next = applyRating(prev, 'easy', D);
    expect(next.state).toBe('mastered');
    expect(next.lapses).toBe(1);
  });
});

describe('applyRating: 同日ルール（箱が動くのは1日1回）', () => {
  it('同日2回目のOKは無変化', () => {
    const first = applyRating(learning(3, D, D - 7), 'ok', D);
    expect(applyRating(first, 'ok', D)).toEqual(first);
  });
  it('同日2回目の余裕でも昇格しない（セッション連打で箱5に到達できない）', () => {
    const first = applyRating(undefined, 'easy', D); // 箱2
    expect(applyRating(first, 'easy', D)).toEqual(first); // 箱2のまま
  });
  it('降格だけは同日でも即時反映（ただしlapsesは日単位）', () => {
    const first = applyRating(learning(4, D, D - 14, 0), 'easy', D); // 箱5
    const demoted = applyRating(first, 'again', D);
    expect(demoted.box).toBe(1);
    expect(demoted.due).toBe(D + 1);
    expect(demoted.lapses).toBe(0); // 同日なのでlapsesは増えない
  });
  it('翌日以降なら再び動く', () => {
    const first = applyRating(undefined, 'easy', D); // 箱2, due D+3
    const next = applyRating(first, 'easy', D + 3);
    expect(next.box).toBe(3);
    expect(next.due).toBe(D + 3 + INTERVALS[3]);
  });
});

describe('applyRating: masteredカード', () => {
  it('OK/余裕では変化しない', () => {
    const m = setMasteredManually(undefined, D);
    expect(applyRating(m, 'ok', D + 1)).toEqual(m);
    expect(applyRating(m, 'easy', D + 1)).toEqual(m);
  });
  it('覚えてない → 箱1に戻る（忘れた申告）', () => {
    const m = setMasteredManually(learning(5, 0, D - 40, 1), D - 40);
    const next = applyRating(m, 'again', D);
    expect(next.state).toBe('learning');
    expect(next.box).toBe(1);
    expect(next.lapses).toBe(2);
  });
});

describe('手動チェック（mastered スイッチ）', () => {
  it('チェックON → mastered、lapsesは保持', () => {
    const prev = learning(2, D, D - 1, 3);
    const m = setMasteredManually(prev, D);
    expect(isMastered(m)).toBe(true);
    expect(m.lapses).toBe(3);
  });
  it('チェックOFF → new tombstone（レコードは残る）', () => {
    const m = setMasteredManually(undefined, D);
    const u = setUnlearnedManually(m, D + 1);
    expect(isNew(u)).toBe(true);
    expect(u.state).toBe('new');
    expect(u.lastRatedDay).toBe(D + 1);
  });
});

describe('isDue: 期日超過は無罰', () => {
  it('due当日・超過はdue、未来はまだ', () => {
    const p = learning(2, D + 3, D);
    expect(isDue(p, D + 2)).toBe(false);
    expect(isDue(p, D + 3)).toBe(true);
    expect(isDue(p, D + 100)).toBe(true); // 100日サボっても罰なし
  });
  it('new/masteredはdueにならない', () => {
    expect(isDue(undefined, D)).toBe(false);
    expect(isDue(setMasteredManually(undefined, D), D + 100)).toBe(false);
  });
});

describe('todayLocal: ローカルタイムゾーンの暦日', () => {
  it('同じローカル日付なら時刻によらず同じ値', () => {
    const morning = new Date(2026, 7, 27, 0, 5); // 2026-08-27 00:05 ローカル
    const night = new Date(2026, 7, 27, 23, 55);
    expect(todayLocal(morning)).toBe(todayLocal(night));
    expect(todayLocal(night) - todayLocal(new Date(2026, 7, 26, 12, 0))).toBe(1);
  });
});
