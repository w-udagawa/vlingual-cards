// 学習モデル（Leitner 5箱）の純関数群（正典: docs/learning-model.md）
// UIにはSRS用語を出さない。ヘルプ表現は
// 「🔴すぐまた出る / 🟡しばらくしてまた出る / 🟢当分出ない」+「記録が動くのは1日1回」。

export type Rating = 'again' | 'ok' | 'easy';

export type CardState = 'new' | 'learning' | 'mastered';

export interface CardProgress {
  state: CardState;
  box: number; // 1〜5（learning時のみ意味を持つ）
  due: number; // 次回復習日（ローカル暦日のepoch日数、learning時のみ）
  lastRatedDay: number; // 最後に記録が動いた日（同日ルール用）
  lapses: number; // 「覚えてない」を押した日数（苦手検出用）
}

// 箱ごとの復習間隔（日）。index=箱番号（0は未使用）
export const INTERVALS = [0, 1, 3, 7, 14, 30] as const;
export const MAX_BOX = 5;

// ローカルタイムゾーンの暦日をepoch日数で返す。
// UTC日だとJSTでは朝9時に日付が切り替わってしまうため、必ずこの関数を使う。
export function todayLocal(now: Date = new Date()): number {
  return Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86400000);
}

function learning(box: number, today: number, lapses: number): CardProgress {
  return {
    state: 'learning',
    box,
    due: today + INTERVALS[box],
    lastRatedDay: today,
    lapses,
  };
}

// 評価を1件適用する。prev が undefined なら未学習（new）。
// ルール:
//  - 覚えてない: いつでも箱1へ降格（即時）。lapses は日単位で+1
//  - だいたいOK: 同じ箱のまま間隔をリピート（昇格しない）
//  - 余裕: 箱+1（新規は箱2へスキップ）。箱5を余裕で通過 → mastered
//  - 同日ルール: 箱・dueが動くのは1日1回（降格のみ例外）。同日2回目以降のOK/余裕は無変化
export function applyRating(
  prev: CardProgress | undefined,
  rating: Rating,
  today: number
): CardProgress {
  const state = prev?.state ?? 'new';

  if (rating === 'again') {
    if (state === 'new') {
      return learning(1, today, 0);
    }
    const lapseInc = prev!.lastRatedDay !== today ? 1 : 0;
    return learning(1, today, prev!.lapses + lapseInc);
  }

  if (state === 'mastered') return prev!;

  if (state === 'new') {
    const box = rating === 'easy' ? 2 : 1;
    return learning(box, today, 0);
  }

  // learning + ok/easy
  if (prev!.lastRatedDay === today) return prev!; // 同日ルール

  if (rating === 'ok') {
    return learning(prev!.box, today, prev!.lapses);
  }

  // easy
  if (prev!.box >= MAX_BOX) {
    return { state: 'mastered', box: MAX_BOX, due: 0, lastRatedDay: today, lapses: prev!.lapses };
  }
  return learning(prev!.box + 1, today, prev!.lapses);
}

// 語彙一覧のチェックボックス（=masteredの手動スイッチ）
export function setMasteredManually(prev: CardProgress | undefined, today: number): CardProgress {
  return {
    state: 'mastered',
    box: prev?.box ?? 0,
    due: 0,
    lastRatedDay: today,
    lapses: prev?.lapses ?? 0,
  };
}

// チェック解除 → new に戻す（レコードは削除せずtombstoneとして残す。
// 削除するとタブ間マージでmasteredが復活してしまうため）
export function setUnlearnedManually(prev: CardProgress | undefined, today: number): CardProgress {
  return {
    state: 'new',
    box: 0,
    due: 0,
    lastRatedDay: today,
    lapses: prev?.lapses ?? 0,
  };
}

export function isNew(p: CardProgress | undefined): boolean {
  return !p || p.state === 'new';
}

export function isMastered(p: CardProgress | undefined): boolean {
  return p?.state === 'mastered';
}

// day 時点でdue到来しているか（期日超過は無罰: due <= day なだけ）
export function isDue(p: CardProgress | undefined, day: number): boolean {
  return p?.state === 'learning' && p.due <= day;
}
