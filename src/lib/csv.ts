// CSVパーサ（RFC 4180準拠のステートマシン + ヘッダー名ベースのマッピング）
// 列順ハードコードの形式分岐は廃止。列の追加（スラング・タイムスタンプ等）に自動で耐える。
import type { VocabCard, VocabCardInput } from '../types';
import { cardId, normalizeWord } from './ids';

export interface ParseResult {
  cards: VocabCard[];
  warnings: string[];
}

// YouTube動画IDを抽出（watch / youtu.be / embed / shorts / live、#フラグメント混入も防ぐ）
export function extractYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&?/#]+)/,
    /youtube\.com\/(?:embed|shorts|live)\/([^&?/#]+)/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// RFC 4180ステートマシン。引用符内の改行・カンマ・"" エスケープ・CRLFに対応。
export function parseCsvRows(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text; // BOM除去
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      pushField();
    } else if (ch === '\n') {
      pushRow();
    } else if (ch === '\r') {
      if (src[i + 1] === '\n') i++;
      pushRow();
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) pushRow();
  return rows;
}

// 列名の後方互換（旧「タレント」→「キャスト名」）
const HEADER_ALIASES: Record<string, string> = { タレント: 'キャスト名' };
const REQUIRED_HEADERS = ['単語', '和訳', '難易度', '品詞', '文脈', '動画URL'] as const;
const LEVELS = ['初級', '中級', '上級'] as const;

function isBlankRow(row: string[]): boolean {
  return row.every(cell => cell.trim() === '');
}

export function parseVocabCsv(text: string): ParseResult {
  const rows = parseCsvRows(text);
  // 先頭の空行はヘッダーではない（旧実装の trim() 相当。空行1つで全滅させない）
  while (rows.length > 0 && isBlankRow(rows[0])) {
    rows.shift();
  }
  if (rows.length < 2) {
    throw new Error('CSVファイルが空です');
  }

  const headers = rows[0].map(h => {
    const name = h.trim();
    return HEADER_ALIASES[name] ?? name;
  });
  const colIndex = new Map<string, number>();
  headers.forEach((h, i) => {
    if (!colIndex.has(h)) colIndex.set(h, i);
  });

  const missing = REQUIRED_HEADERS.filter(h => !colIndex.has(h));
  if (missing.length > 0) {
    throw new Error(
      `必須列が見つかりません: ${missing.join(', ')}（実際のヘッダー: ${headers.join(',')}）`
    );
  }

  const get = (row: string[], name: string): string => {
    const i = colIndex.get(name);
    return i === undefined || i >= row.length ? '' : row[i].trim();
  };

  const warnings: string[] = [];
  const cards: VocabCard[] = [];
  const seen = new Map<string, number>(); // cardId → 初出行

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const rowNo = r + 1;
    if (isBlankRow(row)) continue;

    const 単語 = get(row, '単語');
    if (!単語) {
      warnings.push(`行${rowNo}: 単語が空のためスキップ`);
      continue;
    }
    const 和訳 = get(row, '和訳');
    if (!和訳) {
      warnings.push(`行${rowNo}: 和訳が空のためスキップ — ${単語}`);
      continue;
    }
    const 難易度 = get(row, '難易度');
    if (!(LEVELS as readonly string[]).includes(難易度)) {
      warnings.push(`行${rowNo}: 難易度が不正（「${難易度}」）のためスキップ — ${単語}`);
      continue;
    }
    const 動画URL = get(row, '動画URL');
    const videoId = extractYouTubeId(動画URL);
    if (!videoId) {
      warnings.push(`行${rowNo}: 動画URLが不正のためスキップ — ${単語}`);
      continue;
    }

    // 同一動画内の重複はパース時に1枚へマージ（初出行を採用）
    const id = cardId(videoId, 単語);
    const firstRow = seen.get(id);
    if (firstRow !== undefined) {
      warnings.push(`行${rowNo}: 「${単語}」は同一動画内で重複（行${firstRow}に統合）`);
      continue;
    }
    seen.set(id, rowNo);

    cards.push({
      id,
      videoId,
      単語: normalizeWord(単語),
      和訳,
      難易度: 難易度 as VocabCard['難易度'],
      品詞: get(row, '品詞'),
      文脈: get(row, '文脈'),
      動画URL,
      動画タイトル: get(row, '動画タイトル') || undefined,
      事務所: get(row, '事務所') || undefined,
      キャスト名: get(row, 'キャスト名') || undefined,
    });
  }

  if (cards.length === 0) {
    throw new Error('有効なデータが見つかりませんでした');
  }

  return { cards, warnings };
}

// ID未付与のカード配列（SAMPLE_DATA等）にIDを付与する（重複IDは初出を採用）
export function attachCardIds(inputs: VocabCardInput[]): VocabCard[] {
  const cards: VocabCard[] = [];
  const seen = new Set<string>();
  for (const input of inputs) {
    const videoId = extractYouTubeId(input.動画URL);
    if (!videoId) continue;
    const id = cardId(videoId, input.単語);
    if (seen.has(id)) continue;
    seen.add(id);
    cards.push({ ...input, 単語: normalizeWord(input.単語), id, videoId });
  }
  return cards;
}
