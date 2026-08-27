// CSV検証スクリプト（アプリと同じパーサを共用）
// 実行: npm run validate-csv [-- --ci]
//   --ci : GitHub Actions用に ::warning アノテーションを出力する
//
// 終了コード:
//   0 = 警告のみ（デプロイは止めない）
//   2 = 構造破壊（ヘッダー欠落・パース不能・有効行ゼロ）
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { parseCsvRows, parseVocabCsv, extractYouTubeId } from '../src/lib/csv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSV_PATH = resolve(__dirname, '../public/vocab.csv');
const CI = process.argv.includes('--ci');

const KNOWN_PARTS = new Set([
  '名詞', '動詞', '形容詞', '副詞', '前置詞', '接続詞', '代名詞', '間投詞',
  'フレーズ', '句動詞', '慣用句', 'スラング',
]);

const warnings: string[] = [];
const infos: string[] = [];

function warn(msg: string) {
  warnings.push(msg);
}

function main(): number {
  let text: string;
  try {
    text = readFileSync(CSV_PATH, 'utf-8');
  } catch {
    console.error(`::error::CSVが読めません: ${CSV_PATH}`);
    return 2;
  }

  // 構造チェック（アプリと同じパーサ）
  let cardCount = 0;
  try {
    const { cards, warnings: parseWarnings } = parseVocabCsv(text);
    cardCount = cards.length;
    parseWarnings.forEach(w => warn(w));
  } catch (err) {
    console.error(`::error::CSVの構造が壊れています: ${err instanceof Error ? err.message : err}`);
    return 2;
  }

  // 追加チェック（生の行ベース）
  const rows = parseCsvRows(text);
  const headers = rows[0].map(h => h.trim());
  const colCount = headers.length;
  const idx = (name: string) => headers.indexOf(name);
  const iWord = idx('単語');
  const iPart = idx('品詞');
  const iContext = idx('文脈');
  const iUrl = idx('動画URL');
  const iTitle = idx('動画タイトル');

  const titlesByVideo = new Map<string, Map<string, number>>(); // videoId → title → 初出行
  let emptyContext = 0;
  let echoContext = 0;

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const rowNo = r + 1;
    if (row.every(c => c.trim() === '')) continue;

    if (row.length !== colCount) {
      warn(`行${rowNo}: 列数がヘッダーと不一致（${row.length}列、期待${colCount}列）`);
      continue;
    }

    const word = (row[iWord] ?? '').trim();
    const part = iPart >= 0 ? (row[iPart] ?? '').trim() : '';
    const context = iContext >= 0 ? (row[iContext] ?? '').trim() : '';
    const url = iUrl >= 0 ? (row[iUrl] ?? '').trim() : '';
    const title = iTitle >= 0 ? (row[iTitle] ?? '').trim() : '';

    if (part && !KNOWN_PARTS.has(part)) {
      warn(`行${rowNo}: 品詞が想定外（「${part}」）— ${word}`);
    }
    if (/[?&]si=/.test(url)) {
      warn(`行${rowNo}: 動画URLに ?si= トラッキングパラメータ — ${word}`);
    }

    const videoId = extractYouTubeId(url);
    if (videoId && title) {
      const titles = titlesByVideo.get(videoId) ?? new Map<string, number>();
      if (!titles.has(title)) titles.set(title, rowNo);
      titlesByVideo.set(videoId, titles);
    }

    if (!context) {
      emptyContext++;
    } else if (context.toLowerCase() === word.toLowerCase()) {
      echoContext++;
    }
  }

  // 動画タイトルの揺れ（同一videoIdに複数タイトル）
  for (const [videoId, titles] of titlesByVideo) {
    if (titles.size > 1) {
      const list = Array.from(titles.keys()).slice(0, 3).join('」「');
      warn(`動画${videoId}: タイトルが${titles.size}通りに揺れています（「${list}」…）。初出行のタイトルが採用されます`);
    }
  }

  if (emptyContext > 0) infos.push(`文脈が空（例文準備中として表示）: ${emptyContext}語`);
  if (echoContext > 0) infos.push(`文脈が単語の単純反復: ${echoContext}語（例文としての情報量がありません）`);

  // 出力
  console.log(`vocab.csv 検証結果: 有効カード ${cardCount}枚`);
  if (warnings.length === 0) {
    console.log('✅ 警告なし');
  } else {
    console.log(`⚠️ 警告 ${warnings.length}件:`);
    for (const w of warnings) {
      console.log(`  - ${w}`);
      if (CI) console.log(`::warning file=public/vocab.csv::${w}`);
    }
  }
  for (const i of infos) console.log(`ℹ️ ${i}`);

  return 0; // 警告は非ブロッキング（デプロイを止めない）
}

process.exit(main());
