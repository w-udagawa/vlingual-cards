// カードIDの正規化・生成（正典: docs/learning-model.md）
// ここが唯一の定義。他の場所で normalize / ID 生成を再実装しないこと。

// 単語文字列の正規化: NFC + trim + 連続空白の圧縮
export function normalizeWord(word: string): string {
  return word.normalize('NFC').trim().replace(/\s+/g, ' ');
}

// カードの安定ID。CSVにID列は追加しない（導出キー）。
// 同一単語でも動画が違えば別カード（文脈=実発話が違うため）。
export function cardId(videoId: string, word: string): string {
  return `${videoId}::${normalizeWord(word)}`;
}
