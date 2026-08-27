import { describe, it, expect, beforeEach } from 'vitest';
import type { VocabCard } from '../../types';
import type { CardProgress } from '../schedule';
import {
  LEARNING_STORE_KEY,
  emptyStore,
  loadStore,
  saveStore,
  mergeCards,
  migrateLegacyChecked,
  exportProgress,
  importProgress,
  validateStore,
} from '../store';

// localStorageの簡易モック（jsdom不要）
class MemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.map.set(key, String(value));
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  clear() {
    this.map.clear();
  }
}

const storage = new MemoryStorage();
(globalThis as Record<string, unknown>).localStorage = storage;

const D = 20000;
const learning = (box: number, lastRatedDay: number): CardProgress => ({
  state: 'learning',
  box,
  due: lastRatedDay + 1,
  lastRatedDay,
  lapses: 0,
});

const makeCard = (videoId: string, word: string): VocabCard => ({
  id: `${videoId}::${word}`,
  videoId,
  単語: word,
  和訳: '訳',
  難易度: '中級',
  品詞: '名詞',
  文脈: 'ctx',
  動画URL: `https://youtu.be/${videoId}`,
});

beforeEach(() => storage.clear());

describe('load/save/validate', () => {
  it('空のときはemptyStore', () => {
    expect(loadStore()).toEqual(emptyStore());
  });

  it('保存→読込の往復', () => {
    const store = { ...emptyStore(), cards: { 'v::w': learning(2, D) } };
    saveStore(store);
    expect(loadStore().cards['v::w']).toEqual(learning(2, D));
  });

  it('壊れたJSONはemptyStoreにフォールバック', () => {
    storage.setItem(LEARNING_STORE_KEY, '{broken');
    expect(loadStore()).toEqual(emptyStore());
  });

  it('validateStoreは不正なカードレコードを落とす', () => {
    const v = validateStore({ version: 1, cards: { good: learning(1, D), bad: { box: 'x' } } });
    expect(v?.cards['good']).toBeDefined();
    expect(v?.cards['bad']).toBeUndefined();
  });
});

describe('mergeCards（タブ間の巻き戻り緩和）', () => {
  it('lastRatedDayが新しい方が勝つ', () => {
    const mem = { a: learning(3, D + 1) };
    const disk = { a: learning(1, D), b: learning(2, D) };
    const merged = mergeCards(mem, disk);
    expect(merged['a'].box).toBe(3); // memが新しい
    expect(merged['b'].box).toBe(2); // diskにしかない → 残る
  });

  it('saveStoreは別タブの書き込みを取り込んでから保存する', () => {
    // 別タブがカードbを保存済み
    saveStore({ ...emptyStore(), cards: { b: learning(2, D) } });
    // このタブはカードaだけ知っている
    const result = saveStore({ ...emptyStore(), cards: { a: learning(1, D) } });
    expect(result.cards['a']).toBeDefined();
    expect(result.cards['b']).toBeDefined();
    expect(loadStore().cards['b']).toBeDefined();
  });
});

describe('migrateLegacyChecked', () => {
  const deck = [makeCard('vidA', 'alpha'), makeCard('vidA', 'beta'), makeCard('vidB', 'alpha')];

  it('旧vocabulary_checkedをmasteredに変換し、旧キーは残す', () => {
    storage.setItem('vocabulary_checked', JSON.stringify({ vidA: ['alpha'] }));
    const migrated = migrateLegacyChecked(emptyStore(), deck, D);
    expect(migrated.cards['vidA::alpha']?.state).toBe('mastered');
    expect(migrated.cards['vidA::beta']).toBeUndefined();
    expect(migrated.migratedLegacy).toBe(true);
    expect(storage.getItem('vocabulary_checked')).not.toBeNull(); // 削除しない
  });

  it("擬似キー'all'は単語一致する全カードに適用", () => {
    storage.setItem('vocabulary_checked', JSON.stringify({ all: ['alpha'] }));
    const migrated = migrateLegacyChecked(emptyStore(), deck, D);
    expect(migrated.cards['vidA::alpha']?.state).toBe('mastered');
    expect(migrated.cards['vidB::alpha']?.state).toBe('mastered');
  });

  it('一度移行したら再実行しない', () => {
    storage.setItem('vocabulary_checked', JSON.stringify({ vidA: ['alpha'] }));
    const once = migrateLegacyChecked(emptyStore(), deck, D);
    storage.setItem('vocabulary_checked', JSON.stringify({ vidA: ['beta'] }));
    const twice = migrateLegacyChecked(once, deck, D);
    expect(twice.cards['vidA::beta']).toBeUndefined();
  });
});

describe('export/import', () => {
  it('エクスポート→インポートの往復でカード進捗が復元される', () => {
    const store = { ...emptyStore(), cards: { 'v::w': learning(4, D) } };
    const json = exportProgress(store);
    const imported = importProgress(emptyStore(), json);
    expect(imported?.cards['v::w']).toEqual(learning(4, D));
  });

  it('インポートはlastRatedDayが新しい方を採用してマージ', () => {
    const backup = exportProgress({ ...emptyStore(), cards: { a: learning(2, D) } });
    const current = { ...emptyStore(), cards: { a: learning(5, D + 10), b: learning(1, D) } };
    const merged = importProgress(current, backup);
    expect(merged?.cards['a'].box).toBe(5); // 現在の方が新しい → 維持
    expect(merged?.cards['b']).toBeDefined();
    // バックアップの方が新しければバックアップが勝つ
    const newerBackup = exportProgress({ ...emptyStore(), cards: { a: learning(4, D + 20) } });
    expect(importProgress(current, newerBackup)?.cards['a'].box).toBe(4);
  });

  it('lastRatedDay同値タイでは現在の進捗が勝つ（当日の学習を巻き戻さない）', () => {
    // 朝エクスポート(box2) → 同日中に学習してbox3（同日ルールでlastRatedDayは同じ）→ 夕方インポート
    const backup = exportProgress({ ...emptyStore(), cards: { a: learning(2, D) } });
    const current = { ...emptyStore(), cards: { a: learning(3, D) } };
    const merged = importProgress(current, backup);
    expect(merged?.cards['a'].box).toBe(3); // 現在が維持される
  });

  it('不正なテキストはnull', () => {
    expect(importProgress(emptyStore(), 'not json')).toBeNull();
    expect(importProgress(emptyStore(), '{"app":"other"}')).toBeNull();
  });
});
