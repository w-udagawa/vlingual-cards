import { describe, it, expect, beforeEach } from 'vitest';
import type { VocabCard } from '../../types';
import type { CardProgress } from '../schedule';
import { setMasteredManually } from '../schedule';
import {
  LEARNING_STORE_KEY,
  LEARNING_STORE_BACKUP_KEY,
  LEARNING_STORE_PARTIAL_BACKUP_PREFIX,
  emptyStore,
  loadStore,
  saveStore,
  mergeCards,
  applyStorageEvent,
  migrateLegacyChecked,
  exportProgress,
  importProgress,
  validateStore,
} from '../store';

// localStorageの簡易モック（jsdom不要。length/key()も実装し、本物のStorageに近づける）
class MemoryStorage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }
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

const allKeys = (): string[] => {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) keys.push(storage.key(i)!);
  return keys;
};

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
  it.each([0, -1, 6, 1.5, NaN, Infinity])('学習中の不正な箱 %s を受け入れない', box => {
    expect(validateStore({ version: 1, cards: { bad: learning(box, D) } })?.cards.bad).toBeUndefined();
  });

  it('配列を進捗マップとして扱わない', () => {
    expect(validateStore({ version: 1, cards: [] })).toBeNull();
  });

  it('非有限の期日・負の失敗回数・小数の日付を受け入れない', () => {
    for (const change of [{ due: Infinity }, { lapses: -1 }, { lastRatedDay: 1.5 }]) {
      expect(validateStore({ version: 1, cards: { bad: { ...learning(1, D), ...change } } })?.cards.bad).toBeUndefined();
    }
  });

  it('空のときはemptyStore・dropped=0', () => {
    const { store, dropped } = loadStore();
    expect(store).toEqual(emptyStore());
    expect(dropped).toBe(0);
  });

  it('保存→読込の往復', () => {
    const store = { ...emptyStore(), cards: { 'v::w': learning(2, D) } };
    saveStore(store);
    expect(loadStore().store.cards['v::w']).toEqual(learning(2, D));
  });

  it('壊れたJSONはemptyStoreにフォールバックし、バックアップへ退避する', () => {
    storage.setItem(LEARNING_STORE_KEY, '{broken');
    const { store, dropped } = loadStore();
    expect(store).toEqual(emptyStore());
    expect(dropped).toBe(0);
    expect(storage.getItem(LEARNING_STORE_BACKUP_KEY)).toBe('{broken');
  });

  it('validateStoreは不正なカードレコードを落とす', () => {
    const v = validateStore({ version: 1, cards: { good: learning(1, D), bad: { box: 'x' } } });
    expect(v?.cards['good']).toBeDefined();
    expect(v?.cards['bad']).toBeUndefined();
  });

  it('レガシーレコード（updatedAtなし）はそのまま読み込める', () => {
    storage.setItem(LEARNING_STORE_KEY, JSON.stringify({ version: 1, cards: { 'v::w': learning(2, D) }, session: null }));
    const { store, dropped } = loadStore();
    expect(dropped).toBe(0);
    expect(store.cards['v::w']).toEqual(learning(2, D));
    expect(store.cards['v::w'].updatedAt).toBeUndefined();
  });
});

describe('部分破損したカードレコード（loadStoreのdropped報告）', () => {
  it('一部レコードが不正なとき、件数を返し原データを退避する（最新1件のみ保持）', () => {
    const raw = JSON.stringify({
      version: 1,
      cards: { good: learning(1, D), bad: { box: 'x' } },
      session: null,
    });
    storage.setItem(LEARNING_STORE_KEY, raw);

    const { store, dropped } = loadStore();
    expect(dropped).toBe(1);
    expect(store.cards['good']).toBeDefined();
    expect(store.cards['bad']).toBeUndefined();

    const backupKeys = allKeys().filter(k => k.startsWith(LEARNING_STORE_PARTIAL_BACKUP_PREFIX));
    expect(backupKeys).toHaveLength(1);
    expect(storage.getItem(backupKeys[0])).toBe(raw);
  });

  it('退避は常に最新1件だけを残す', () => {
    storage.setItem(
      LEARNING_STORE_KEY,
      JSON.stringify({ version: 1, cards: { good: learning(1, D), bad1: { box: 'x' } }, session: null })
    );
    loadStore();
    storage.setItem(
      LEARNING_STORE_KEY,
      JSON.stringify({ version: 1, cards: { good: learning(1, D), bad2: { box: 'y' } }, session: null })
    );
    loadStore();

    const backupKeys = allKeys().filter(k => k.startsWith(LEARNING_STORE_PARTIAL_BACKUP_PREFIX));
    expect(backupKeys).toHaveLength(1);
    expect(storage.getItem(backupKeys[0])).toContain('bad2');
  });
});

describe('saveStoreの保存結果（persisted/reason）', () => {
  it('保存できればpersisted=true', () => {
    const result = saveStore({ ...emptyStore(), cards: { a: learning(1, D) } });
    expect(result.persisted).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('quota超過はpersisted=false・reason=quota', () => {
    const original = storage.setItem.bind(storage);
    storage.setItem = () => {
      const err = new Error('quota');
      err.name = 'QuotaExceededError';
      throw err;
    };
    try {
      const result = saveStore({ ...emptyStore(), cards: { a: learning(1, D) } });
      expect(result.persisted).toBe(false);
      expect(result.reason).toBe('quota');
      // マージ済みの内容自体は返す（学習は続行できる）
      expect(result.store.cards['a']).toBeDefined();
    } finally {
      storage.setItem = original;
    }
  });

  it('保存禁止（SecurityError）はpersisted=false・reason=denied', () => {
    const original = storage.setItem.bind(storage);
    storage.setItem = () => {
      const err = new Error('denied');
      err.name = 'SecurityError';
      throw err;
    };
    try {
      const result = saveStore({ ...emptyStore(), cards: { a: learning(1, D) } });
      expect(result.persisted).toBe(false);
      expect(result.reason).toBe('denied');
    } finally {
      storage.setItem = original;
    }
  });

  it('localStorage自体が使えない環境はpersisted=false・reason=unavailable', () => {
    const original = (globalThis as Record<string, unknown>).localStorage;
    delete (globalThis as Record<string, unknown>).localStorage;
    try {
      const result = saveStore({ ...emptyStore(), cards: { a: learning(1, D) } });
      expect(result.persisted).toBe(false);
      expect(result.reason).toBe('unavailable');
    } finally {
      (globalThis as Record<string, unknown>).localStorage = original;
    }
  });
});

describe('mergeCards（タブ間の巻き戻り緩和・updatedAt基準）', () => {
  it('updatedAtが新しい方が勝つ（lastRatedDayではなく）', () => {
    // memの方がbox・lastRatedDayは古いが、updatedAtは新しい
    const mem = { a: { ...learning(1, D), updatedAt: 100 } };
    const disk = { a: { ...learning(3, D + 5), updatedAt: 50 }, b: learning(2, D) };
    const merged = mergeCards(mem, disk);
    expect(merged['a'].box).toBe(1); // updatedAtが新しいmemが勝つ
    expect(merged['b'].box).toBe(2); // diskにしかない → 残る
  });

  it('updatedAt同値タイ（レガシー同士含む）はメモリ側が勝つ', () => {
    const mem = { a: learning(3, D) }; // updatedAtなし＝0扱い
    const disk = { a: learning(1, D) }; // 同じく0扱い
    const merged = mergeCards(mem, disk);
    expect(merged['a'].box).toBe(3);
  });

  it('saveStoreは別タブの書き込みを取り込んでから保存する', () => {
    // 別タブがカードbを保存済み
    saveStore({ ...emptyStore(), cards: { b: learning(2, D) } });
    // このタブはカードaだけ知っている
    const result = saveStore({ ...emptyStore(), cards: { a: learning(1, D) } });
    expect(result.store.cards['a']).toBeDefined();
    expect(result.store.cards['b']).toBeDefined();
    expect(loadStore().store.cards['b']).toBeDefined();
  });

  it('同日でも、updatedAtが新しいdisk側（別タブの新しい変更）は巻き戻さない', () => {
    // 別タブが同日にXをmasteredへ更新済み（updatedAtが新しい）
    saveStore({ ...emptyStore(), cards: { x: { ...setMasteredManually(undefined, D), updatedAt: 2000 } } });
    // このタブは同日、Xの古い認識（updatedAtが古い）のままYを保存
    const result = saveStore({
      ...emptyStore(),
      cards: {
        x: { ...learning(3, D), updatedAt: 1000 },
        y: { ...learning(1, D), updatedAt: 1500 },
      },
    });
    expect(result.store.cards['x'].state).toBe('mastered'); // 巻き戻されない
    expect(result.store.cards['y'].box).toBe(1); // 新しい変更は残る
  });
});

describe('applyStorageEvent（別タブのstorageイベントを取り込む）', () => {
  it('古いタブのpayloadは新しいタブの評価を巻き戻さない', () => {
    const newerLocal = { ...emptyStore(), cards: { x: { ...learning(5, D), updatedAt: 2000 } } };
    const staleRemotePayload = JSON.stringify({
      version: 1,
      cards: { x: { ...learning(1, D), updatedAt: 1000 } },
      session: null,
    });
    const merged = applyStorageEvent(newerLocal, { key: LEARNING_STORE_KEY, newValue: staleRemotePayload });
    expect(merged).toBeNull(); // 変化なし＝巻き戻されない
  });

  it('新しいタブのpayloadは取り込む', () => {
    const staleLocal = { ...emptyStore(), cards: { x: { ...learning(1, D), updatedAt: 1000 } } };
    const newerRemotePayload = JSON.stringify({
      version: 1,
      cards: { x: { ...learning(5, D), updatedAt: 2000 } },
      session: null,
    });
    const merged = applyStorageEvent(staleLocal, { key: LEARNING_STORE_KEY, newValue: newerRemotePayload });
    expect(merged?.cards['x'].box).toBe(5);
  });

  it('無関係なキーのイベントは無視する', () => {
    const local = { ...emptyStore(), cards: { x: learning(1, D) } };
    expect(applyStorageEvent(local, { key: 'other_key', newValue: '{}' })).toBeNull();
  });

  it('不正なJSONペイロードは無視する', () => {
    const local = { ...emptyStore(), cards: { x: learning(1, D) } };
    expect(applyStorageEvent(local, { key: LEARNING_STORE_KEY, newValue: '{broken' })).toBeNull();
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

  it('インポートはupdatedAtが新しい方を採用してマージ', () => {
    const backup = exportProgress({ ...emptyStore(), cards: { a: { ...learning(2, D), updatedAt: 100 } } });
    const current = {
      ...emptyStore(),
      cards: { a: { ...learning(5, D + 10), updatedAt: 50 }, b: learning(1, D) },
    };
    const merged = importProgress(current, backup);
    expect(merged?.cards['a'].box).toBe(2); // バックアップの方がupdatedAtが新しい → 採用
    expect(merged?.cards['b']).toBeDefined();

    // 現在の方がupdatedAtが新しければ現在が勝つ
    const olderBackup = exportProgress({ ...emptyStore(), cards: { a: { ...learning(4, D + 20), updatedAt: 10 } } });
    expect(importProgress(current, olderBackup)?.cards['a'].box).toBe(5);
  });

  it('updatedAt同値タイ（レガシー同士含む）では現在の進捗が勝つ（当日の学習を巻き戻さない）', () => {
    // 朝エクスポート(box2) → 同日中に学習してbox3 → 夕方インポート（どちらもupdatedAtなし＝0扱い）
    const backup = exportProgress({ ...emptyStore(), cards: { a: learning(2, D) } });
    const current = { ...emptyStore(), cards: { a: learning(3, D) } };
    const merged = importProgress(current, backup);
    expect(merged?.cards['a'].box).toBe(3); // 現在が維持される
  });

  it('インポート直後の評価は両方とも保持される', () => {
    const importedPayload = exportProgress({ ...emptyStore(), cards: { a: { ...learning(2, D), updatedAt: 500 } } });
    const afterImport = importProgress(emptyStore(), importedPayload)!;
    expect(afterImport.cards['a']).toBeDefined();

    // インポート直後に別カードを評価してsaveStore
    const rated = { ...afterImport.cards, b: { ...learning(1, D), updatedAt: 600 } };
    const result = saveStore({ ...afterImport, cards: rated });
    expect(result.persisted).toBe(true);
    expect(result.store.cards['a']).toBeDefined(); // インポート分
    expect(result.store.cards['b']).toBeDefined(); // 直後の評価分
  });

  it('不正なテキストはnull', () => {
    expect(importProgress(emptyStore(), 'not json')).toBeNull();
    expect(importProgress(emptyStore(), '{"app":"other"}')).toBeNull();
  });
});
