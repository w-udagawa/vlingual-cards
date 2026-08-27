// 学習進捗の永続ストア（localStorage: vlc_learning_v1）
// 旧 `vocabulary_checked` は mastered へ一度だけ変換し、旧キー自体は削除せず放置する
// （ロールバック時の安全弁。読み取りコードだけを新実装に切り替える）。
import type { VocabCard } from '../types';
import { VOCABULARY_CHECKED_KEY } from '../types';
import type { CardProgress } from './schedule';
import { setMasteredManually } from './schedule';
import { cardId } from './ids';

export const LEARNING_STORE_KEY = 'vlc_learning_v1';
export const LEARNING_STORE_BACKUP_KEY = 'vlc_learning_v1_backup';

export interface ActiveSession {
  scopeId: string; // 'video:<id>' | 'cast:<name>' | 'all' | 'review'
  day: number; // セットを組んだ日（別の日なら組み直す）
  queue: string[];
}

export interface LearningStore {
  version: 1;
  migratedLegacy: boolean;
  cards: Record<string, CardProgress>;
  session: ActiveSession | null;
}

export function emptyStore(): LearningStore {
  return { version: 1, migratedLegacy: false, cards: {}, session: null };
}

function isValidProgress(p: unknown): p is CardProgress {
  if (typeof p !== 'object' || p === null) return false;
  const o = p as Record<string, unknown>;
  return (
    (o.state === 'new' || o.state === 'learning' || o.state === 'mastered') &&
    typeof o.box === 'number' &&
    typeof o.due === 'number' &&
    typeof o.lastRatedDay === 'number' &&
    typeof o.lapses === 'number'
  );
}

export function validateStore(raw: unknown): LearningStore | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (o.version !== 1) return null;
  if (typeof o.cards !== 'object' || o.cards === null) return null;
  const cards: Record<string, CardProgress> = {};
  for (const [id, p] of Object.entries(o.cards as Record<string, unknown>)) {
    if (isValidProgress(p)) cards[id] = p;
  }
  let session: ActiveSession | null = null;
  const s = o.session as Record<string, unknown> | null;
  if (
    s &&
    typeof s.scopeId === 'string' &&
    typeof s.day === 'number' &&
    Array.isArray(s.queue) &&
    s.queue.every(q => typeof q === 'string')
  ) {
    session = {
      scopeId: s.scopeId,
      day: s.day,
      queue: s.queue as string[],
    };
  }
  return {
    version: 1,
    migratedLegacy: o.migratedLegacy === true,
    cards,
    session,
  };
}

// 読めない/検証不能なデータは黙って捨てず、バックアップキーへ一度だけ退避してから
// 空ストアで開始する（次のsaveStoreによる無言の全消去を復旧可能にする）
function stashCorruptStore(raw: string) {
  try {
    if (!localStorage.getItem(LEARNING_STORE_BACKUP_KEY)) {
      localStorage.setItem(LEARNING_STORE_BACKUP_KEY, raw);
    }
    console.error('[STORE] 進捗データを読めなかったため、バックアップへ退避しました:', LEARNING_STORE_BACKUP_KEY);
  } catch {
    // 退避すら失敗した場合は諦める
  }
}

export function loadStore(): LearningStore {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(LEARNING_STORE_KEY);
    if (!raw) return emptyStore();
    const store = validateStore(JSON.parse(raw));
    if (!store) {
      stashCorruptStore(raw);
      return emptyStore();
    }
    return store;
  } catch {
    if (raw) stashCorruptStore(raw);
    return emptyStore();
  }
}

// タブ間のlast-write-wins巻き戻り緩和: カードごとに lastRatedDay が新しい方を残す
// （同日はメモリ側=この保存を優先）
export function mergeCards(
  mem: Record<string, CardProgress>,
  disk: Record<string, CardProgress>
): Record<string, CardProgress> {
  const merged: Record<string, CardProgress> = { ...disk };
  for (const [id, p] of Object.entries(mem)) {
    const d = merged[id];
    if (!d || p.lastRatedDay >= d.lastRatedDay) merged[id] = p;
  }
  return merged;
}

export function saveStore(store: LearningStore): LearningStore {
  let toSave = store;
  try {
    const raw = localStorage.getItem(LEARNING_STORE_KEY);
    if (raw) {
      const disk = validateStore(JSON.parse(raw));
      if (disk) {
        toSave = { ...store, cards: mergeCards(store.cards, disk.cards) };
      }
    }
  } catch {
    // 読み戻し失敗時はそのまま上書き
  }
  try {
    localStorage.setItem(LEARNING_STORE_KEY, JSON.stringify(toSave));
  } catch {
    // quota超過等は握る（学習は続行できる）
  }
  return toSave;
}

// 旧 `vocabulary_checked`（{videoId: 単語[]} + 擬似キー'all'）→ mastered への一度きりの移行。
// 'all' キーは旧実装のキー衝突バグ由来なので、単語一致する全カードに best-effort で適用する。
export function migrateLegacyChecked(
  store: LearningStore,
  allCards: VocabCard[],
  today: number
): LearningStore {
  if (store.migratedLegacy) return store;
  const cards = { ...store.cards };
  try {
    const raw = localStorage.getItem(VOCABULARY_CHECKED_KEY);
    if (raw) {
      const legacy = JSON.parse(raw) as Record<string, string[]>;
      const byWord = new Map<string, VocabCard[]>();
      const byId = new Set<string>();
      for (const c of allCards) {
        const list = byWord.get(c.単語) ?? [];
        list.push(c);
        byWord.set(c.単語, list);
        byId.add(c.id);
      }
      for (const [videoId, words] of Object.entries(legacy)) {
        if (!Array.isArray(words)) continue;
        for (const word of words) {
          if (typeof word !== 'string') continue;
          if (videoId === 'all') {
            for (const c of byWord.get(word.trim()) ?? []) {
              if (!cards[c.id]) cards[c.id] = setMasteredManually(undefined, today);
            }
          } else {
            const id = cardId(videoId, word);
            if (!cards[id] && byId.has(id)) {
              cards[id] = setMasteredManually(undefined, today);
            }
          }
        }
      }
    }
  } catch {
    // 旧データが壊れていても移行はスキップするだけ
  }
  return { ...store, migratedLegacy: true, cards };
}

// エクスポート/インポート（iOS Safariの7日evictionへのゼロコスト保険）
export interface ExportPayload {
  app: 'vlingual-cards';
  version: 1;
  cards: Record<string, CardProgress>;
}

export function exportProgress(store: LearningStore): string {
  const payload: ExportPayload = { app: 'vlingual-cards', version: 1, cards: store.cards };
  return JSON.stringify(payload);
}

// インポート: カードごとに lastRatedDay が新しい方を採用してマージ。
// 同値タイでは現在の進捗が勝つ（当日の学習成果を古いバックアップで巻き戻さないため）。
export function importProgress(store: LearningStore, text: string): LearningStore | null {
  try {
    const raw = JSON.parse(text) as Record<string, unknown>;
    if (raw.app !== 'vlingual-cards' || raw.version !== 1) return null;
    const imported = validateStore({ version: 1, cards: raw.cards, session: null });
    if (!imported) return null;
    return { ...store, cards: mergeCards(store.cards, imported.cards) };
  } catch {
    return null;
  }
}
