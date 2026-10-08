// リスニングリーダーのデータ取得（fetch のみ。検証は reader.ts の純関数）。
//
// 取得元は既定で /sentences。開発時に手書きの見本で確認したいときは
//   VITE_SENTENCES_BASE=/fixtures/sentences npm run dev
// （fixtures/ は public/ の外なので本番ビルドには入らない）。
import type { Parsed, ReaderDoc, ReaderIndexItem } from './reader';
import { isValidYouTubeId, parseSentenceDoc, parseSentenceIndex } from './reader';

export const SENTENCES_BASE: string = (
  (import.meta.env.VITE_SENTENCES_BASE as string | undefined) || '/sentences'
).replace(/\/+$/, '');

async function fetchJson(url: string): Promise<unknown> {
  // Accept を明示: 開発サーバーは無いファイルに index.html を返すことがある（SPA フォールバック）
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/**
 * 一覧を読む。無い・壊れている・空のときは null（ホームの導線を黙って隠すため、例外は投げない）。
 */
export async function loadSentenceIndex(): Promise<ReaderIndexItem[] | null> {
  try {
    const parsed = parseSentenceIndex(await fetchJson(`${SENTENCES_BASE}/index.json`));
    if (!parsed || parsed.value.length === 0) return null;
    return parsed.value;
  } catch {
    return null;
  }
}

/** 1 本ぶんの文を読む。失敗は例外（リーダー画面がエラー表示する） */
export async function loadSentenceDoc(videoId: string): Promise<Parsed<ReaderDoc>> {
  if (!isValidYouTubeId(videoId)) throw new Error('invalid video id');
  const parsed = parseSentenceDoc(await fetchJson(`${SENTENCES_BASE}/${videoId}.json`), videoId);
  if (!parsed) throw new Error('invalid sentence data');
  return parsed;
}
