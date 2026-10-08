// リスニングリーダーの純関数（データ契約の検証・再生位置 → 文の同期）。
//
// データ契約（clipper 側が書き出す。docs は README/CLAUDE.md の「リスニングリーダー」）:
//   public/sentences/index.json        { version: 1, items: [{ videoId, clipId, title, cast, count }] }
//   public/sentences/<videoId>.json    { version: 1, videoId, clipId, title, cast, durationSec,
//                                        sentences: [{ i, start, end, en, ja, spoken }] }
// 時刻は YouTube 動画そのものの秒軸。spoken === "ja" は「配信者は日本語で話していて、
// en はその英訳」の意味（UI は淡色＋ラベルで出す）。
//
// 外部から来る JSON なので、壊れた行は黙って全体を落とさず「その行だけ捨てて件数を返す」。

export const SENTENCES_VERSION = 1;

export type SpokenLang = 'en' | 'ja' | null;

export interface ReaderSentence {
  i: number;
  start: number;
  end: number;
  en: string;
  ja: string | null;
  spoken: SpokenLang;
}

export interface ReaderDoc {
  videoId: string;
  clipId: number | string | null;
  title: string;
  cast: string;
  durationSec: number | null;
  sentences: ReaderSentence[];
}

export interface ReaderIndexItem {
  videoId: string;
  clipId: number | string | null;
  title: string;
  cast: string;
  count: number;
}

export interface Parsed<T> {
  value: T;
  /** 検証で捨てた行数（0 なら全行採用） */
  dropped: number;
}

const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/;

/** YouTube 動画 ID（11 文字）として妥当か。URL・パスに埋め込む前に必ず通す */
export function isValidYouTubeId(id: unknown): id is string {
  return typeof id === 'string' && YOUTUBE_ID_RE.test(id);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function asText(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function asClipId(v: unknown): number | string | null {
  if (isFiniteNumber(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') return v.trim();
  return null;
}

function asSpoken(v: unknown): SpokenLang {
  return v === 'en' || v === 'ja' ? v : null;
}

/** 1 文を検証する。時刻が壊れている・英文が空の行は null（捨てる） */
export function parseSentence(raw: unknown, fallbackIndex: number): ReaderSentence | null {
  if (!isRecord(raw)) return null;
  const { start, end } = raw;
  if (!isFiniteNumber(start) || !isFiniteNumber(end)) return null;
  if (start < 0 || end < start) return null;
  const en = asText(raw.en);
  if (!en) return null;
  const ja = asText(raw.ja);
  return {
    i: isFiniteNumber(raw.i) ? raw.i : fallbackIndex,
    start,
    end,
    en,
    ja: ja || null,
    spoken: asSpoken(raw.spoken),
  };
}

/**
 * 文の列を開始時刻順に正規化する（同時刻は i → 元の順で安定）。
 * 二分探索の前提を満たすため、入力が並んでいなくても必ずここを通す。
 */
export function normalizeSentences(sentences: readonly ReaderSentence[]): ReaderSentence[] {
  return sentences
    .map((s, order) => ({ s, order }))
    .sort((a, b) => a.s.start - b.s.start || a.s.i - b.s.i || a.order - b.order)
    .map(({ s }) => s);
}

/**
 * <videoId>.json を検証する。全体として読めなければ null。
 * expectedId を渡すと、ファイル内の videoId と食い違うときも null（取り違え防止）。
 */
export function parseSentenceDoc(raw: unknown, expectedId?: string): Parsed<ReaderDoc> | null {
  if (!isRecord(raw)) return null;
  if (raw.version !== SENTENCES_VERSION) return null;
  if (!isValidYouTubeId(raw.videoId)) return null;
  if (expectedId !== undefined && raw.videoId !== expectedId) return null;
  if (!Array.isArray(raw.sentences)) return null;

  const valid: ReaderSentence[] = [];
  raw.sentences.forEach((row, idx) => {
    const s = parseSentence(row, idx);
    if (s) valid.push(s);
  });

  return {
    value: {
      videoId: raw.videoId,
      clipId: asClipId(raw.clipId),
      title: asText(raw.title),
      cast: asText(raw.cast),
      durationSec: isFiniteNumber(raw.durationSec) && raw.durationSec > 0 ? raw.durationSec : null,
      sentences: normalizeSentences(valid),
    },
    dropped: raw.sentences.length - valid.length,
  };
}

/** sentences/index.json を検証する。全体として読めなければ null。同じ videoId は初出を採る */
export function parseSentenceIndex(raw: unknown): Parsed<ReaderIndexItem[]> | null {
  if (!isRecord(raw)) return null;
  if (raw.version !== SENTENCES_VERSION) return null;
  if (!Array.isArray(raw.items)) return null;

  const seen = new Set<string>();
  const items: ReaderIndexItem[] = [];
  for (const row of raw.items) {
    if (!isRecord(row) || !isValidYouTubeId(row.videoId) || seen.has(row.videoId)) continue;
    const count = isFiniteNumber(row.count) && row.count >= 0 ? Math.floor(row.count) : 0;
    seen.add(row.videoId);
    items.push({
      videoId: row.videoId,
      clipId: asClipId(row.clipId),
      title: asText(row.title) || row.videoId,
      cast: asText(row.cast),
      count,
    });
  }
  return { value: items, dropped: raw.items.length - items.length };
}

/**
 * 再生位置 t（秒）で強調すべき文の添字。sentences は normalizeSentences 済みが前提。
 * - 最初の文より前: -1
 * - 文と文の隙間（無音・BGM）: 直前の文のまま（目で追っている位置を飛ばさない）
 * - 最後の文の後: 最後の文のまま
 * start <= t となる最後の文を二分探索で探す（O(log n)。100ms ごとに呼ばれる）。
 */
export function findActiveIndex(sentences: readonly ReaderSentence[], t: number): number {
  if (sentences.length === 0 || !Number.isFinite(t)) return -1;
  let lo = 0;
  let hi = sentences.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sentences[mid].start <= t) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

/** 文の先頭へ飛ぶときの位置。頭の子音が欠けないよう少しだけ手前から（0 未満にはしない） */
export const SEEK_LEAD_SEC = 0.15;
export function seekTarget(sentence: Pick<ReaderSentence, 'start'>): number {
  return Math.max(0, sentence.start - SEEK_LEAD_SEC);
}

/**
 * 強調を音よりわずかに先行させる幅。目は耳より先に行頭へ行きたいのと、
 * seekTarget で手前に飛んだ直後に「1 つ前の文」が一瞬光るのを防ぐため、
 * SEEK_LEAD_SEC より大きくしておく（テストで固定）。
 */
export const HIGHLIGHT_LEAD_SEC = 0.25;

/** プレーヤーの現在位置 → 強調する文（UI はこちらを呼ぶ） */
export function activeIndexAt(sentences: readonly ReaderSentence[], playerTime: number): number {
  return findActiveIndex(sentences, playerTime + HIGHLIGHT_LEAD_SEC);
}

/** 再生速度の選択肢（YouTube の setPlaybackRate が受け付ける値だけ） */
export const PLAYBACK_RATES = [0.75, 1, 1.25] as const;
export type PlaybackRate = (typeof PLAYBACK_RATES)[number];

/** 保存値などから再生速度を復元。候補に無い値は 1 */
export function parsePlaybackRate(raw: string | null): PlaybackRate {
  const n = raw === null ? NaN : Number(raw);
  return (PLAYBACK_RATES as readonly number[]).includes(n) ? (n as PlaybackRate) : 1;
}

/** 秒 → "m:ss"（1 時間以上は "h:mm:ss"） */
export function formatTime(sec: number): string {
  const total = Number.isFinite(sec) && sec > 0 ? Math.floor(sec) : 0;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
