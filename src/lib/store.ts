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
// 部分破損（一部レコードだけ不正）を検出した際の退避キー接頭辞。
// 常に最新1件だけを残す（stashPartialInvalid参照）。
export const LEARNING_STORE_PARTIAL_BACKUP_PREFIX = 'vlingual:backup:';

export interface ActiveSession {
  scopeId: string; // 'video:<id>' | 'cast:<name>' | 'all' | 'review'
  day: number; // セットを組んだ日（別の日なら組み直す）
  queue: string[];
}

// タブ間マージ用のupdatedAt（epoch ms）を任意で持つカード進捗レコード。
// 既存レコード（updatedAtなし）はレガシーとして扱い、比較時は0扱いにする。
export type StoredCardProgress = CardProgress & { updatedAt?: number };

export interface LearningStore {
  version: 1;
  migratedLegacy: boolean;
  cards: Record<string, StoredCardProgress>;
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
    Number.isSafeInteger(o.box) && Number(o.box) >= 0 && Number(o.box) <= 5 &&
    (o.state !== 'learning' || Number(o.box) >= 1) &&
    Number.isSafeInteger(o.due) &&
    Number.isSafeInteger(o.lastRatedDay) &&
    Number.isSafeInteger(o.lapses) && Number(o.lapses) >= 0
  );
}

// updatedAtの取り出し（欠損・不正値は0＝レガシー扱い）
function updatedAtOf(p: StoredCardProgress): number {
  return typeof p.updatedAt === 'number' && Number.isFinite(p.updatedAt) && p.updatedAt >= 0
    ? p.updatedAt
    : 0;
}

export function validateStore(raw: unknown): LearningStore | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (o.version !== 1) return null;
  if (typeof o.cards !== 'object' || o.cards === null || Array.isArray(o.cards)) return null;
  const cards: Record<string, StoredCardProgress> = {};
  for (const [id, p] of Object.entries(o.cards as Record<string, unknown>)) {
    if (!isValidProgress(p)) continue;
    // updatedAtは任意項目。不正な値は「無し（=レガシー）」として扱い、レコード自体は残す
    const rawUpdatedAt = (p as unknown as Record<string, unknown>).updatedAt;
    const updatedAt = Number.isSafeInteger(rawUpdatedAt) && Number(rawUpdatedAt) >= 0
      ? (rawUpdatedAt as number)
      : undefined;
    cards[id] = updatedAt !== undefined ? { ...p, updatedAt } : { ...p };
  }
  let session: ActiveSession | null = null;
  const s = o.session as Record<string, unknown> | null;
  if (
    s &&
    typeof s.scopeId === 'string' &&
    Number.isSafeInteger(s.day) &&
    Array.isArray(s.queue) &&
    s.queue.every(q => typeof q === 'string')
  ) {
    session = {
      scopeId: s.scopeId,
      day: s.day as number,
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

// ストア自体は構造として妥当だが、一部のカードレコードだけ不正で落とした場合の退避。
// 常に最新1件だけを残す（古い退避キーは削除してから書く）。
function stashPartialInvalid(raw: string) {
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(LEARNING_STORE_PARTIAL_BACKUP_PREFIX)) toRemove.push(key);
    }
    toRemove.forEach(k => localStorage.removeItem(k));
    localStorage.setItem(`${LEARNING_STORE_PARTIAL_BACKUP_PREFIX}${Date.now()}`, raw);
    console.error('[STORE] 一部の進捗レコードが不正だったため、元データを退避しました');
  } catch {
    // 退避すら失敗した場合は諦める（件数の通知自体は行える）
  }
}

export interface LoadResult {
  store: LearningStore;
  dropped: number; // 検証で落とされたカードレコード数（0なら全件正常）
}

export function loadStore(): LoadResult {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(LEARNING_STORE_KEY);
  } catch {
    return { store: emptyStore(), dropped: 0 };
  }
  if (!raw) return { store: emptyStore(), dropped: 0 };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    stashCorruptStore(raw);
    return { store: emptyStore(), dropped: 0 };
  }

  const store = validateStore(parsed);
  if (!store) {
    stashCorruptStore(raw);
    return { store: emptyStore(), dropped: 0 };
  }

  const p = parsed as Record<string, unknown>;
  const rawCards = typeof p.cards === 'object' && p.cards !== null && !Array.isArray(p.cards)
    ? (p.cards as Record<string, unknown>)
    : {};
  const dropped = Math.max(0, Object.keys(rawCards).length - Object.keys(store.cards).length);
  if (dropped > 0) {
    stashPartialInvalid(raw);
  }
  return { store, dropped };
}

// タブ間のlast-write-wins巻き戻り緩和: カードごとに updatedAt が新しい方を残す
// （レガシーレコード＝updatedAtなしは0扱い。同値タイはメモリ側＝この保存を優先）
export function mergeCards(
  mem: Record<string, StoredCardProgress>,
  disk: Record<string, StoredCardProgress>
): Record<string, StoredCardProgress> {
  const merged: Record<string, StoredCardProgress> = { ...disk };
  for (const [id, p] of Object.entries(mem)) {
    const d = merged[id];
    if (!d || updatedAtOf(p) >= updatedAtOf(d)) merged[id] = p;
  }
  return merged;
}

export type SaveFailureReason = 'quota' | 'denied' | 'unavailable' | 'unknown';

export interface SaveResult {
  store: LearningStore; // 実際に採用された内容（他タブ分とマージ済み。保存失敗時も呼び出し元が使うべき値）
  persisted: boolean; // localStorageへの書き込みが成功したか
  reason?: SaveFailureReason; // persisted=falseのときのみ
}

function errorName(err: unknown): string {
  if (err instanceof Error) return err.name;
  if (typeof err === 'object' && err !== null && 'name' in err) {
    return String((err as { name: unknown }).name);
  }
  return '';
}

function classifySaveError(err: unknown): SaveFailureReason {
  const name = errorName(err);
  if (name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED') return 'quota';
  if (name === 'SecurityError') return 'denied';
  return 'unknown';
}

export function saveStore(store: LearningStore): SaveResult {
  // localStorage自体に触れない環境（一部のプライベートブラウジング・SSR等）
  let ls: Storage;
  try {
    if (typeof localStorage === 'undefined' || localStorage === null) {
      return { store, persisted: false, reason: 'unavailable' };
    }
    ls = localStorage;
  } catch {
    return { store, persisted: false, reason: 'unavailable' };
  }

  let toSave = store;
  try {
    const raw = ls.getItem(LEARNING_STORE_KEY);
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
    ls.setItem(LEARNING_STORE_KEY, JSON.stringify(toSave));
    return { store: toSave, persisted: true };
  } catch (err) {
    // quota超過等。学習自体は続行できるよう、マージ済みの内容はそのまま返す
    return { store: toSave, persisted: false, reason: classifySaveError(err) };
  }
}

// 別タブの書き込みをstorageイベント経由で取り込む。
// 変更があったカードだけを反映し、ローカル側がすでに新しい（updatedAtが同値以上）
// カードは巻き戻さない。セッション（当日のセット）はタブごとの状態のままにする。
export function applyStorageEvent(
  current: LearningStore,
  event: { key: string | null; newValue: string | null }
): LearningStore | null {
  if (event.key !== LEARNING_STORE_KEY || !event.newValue) return null;

  let incoming: LearningStore | null;
  try {
    incoming = validateStore(JSON.parse(event.newValue));
  } catch {
    return null;
  }
  if (!incoming) return null;

  let changed = false;
  const cards = { ...current.cards };
  for (const [id, remote] of Object.entries(incoming.cards)) {
    const local = cards[id];
    if (!local || updatedAtOf(remote) > updatedAtOf(local)) {
      cards[id] = remote;
      changed = true;
    }
  }
  if (!changed) return null;
  return { ...current, cards };
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
              if (!cards[c.id]) cards[c.id] = { ...setMasteredManually(undefined, today), updatedAt: Date.now() };
            }
          } else {
            const id = cardId(videoId, word);
            if (!cards[id] && byId.has(id)) {
              cards[id] = { ...setMasteredManually(undefined, today), updatedAt: Date.now() };
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
  cards: Record<string, StoredCardProgress>;
}

export function exportProgress(store: LearningStore): string {
  const payload: ExportPayload = { app: 'vlingual-cards', version: 1, cards: store.cards };
  return JSON.stringify(payload);
}

// インポート: カードごとに updatedAt が新しい方を採用してマージ。
// 同値タイ（レガシーのupdatedAtなし同士も含む）では現在の進捗が勝つ
// （当日の学習成果を古いバックアップで巻き戻さないため）。
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
