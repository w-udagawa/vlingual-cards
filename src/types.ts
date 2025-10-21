// 語彙カードの型定義
export interface VocabCard {
  単語: string;
  和訳: string;
  難易度: '初級' | '中級' | '上級';
  品詞: string;
  文脈: string;
  動画URL: string;
}

// 進捗データの型定義
export interface Progress {
  seen: number;
  again: number;
  ok: number;
  easy: number;
}

// 進捗データマップ（単語をキーとする）
export type ProgressData = Record<string, Progress>;

// サンプルデータ（CSV読み込みエラー時のフォールバック用）
export const SAMPLE_DATA: VocabCard[] = [
  {
    単語: "accomplish",
    和訳: "達成する",
    難易度: "中級",
    品詞: "動詞",
    文脈: "I want to accomplish my goals this year. (今年は目標を達成したい)",
    動画URL: "https://youtube.com/@VlingualChannel"
  },
  {
    単語: "resilient",
    和訳: "回復力のある",
    難易度: "上級",
    品詞: "形容詞",
    文脈: "She is resilient in the face of challenges. (彼女は困難に直面しても回復力がある)",
    動画URL: "https://youtube.com/@VlingualChannel"
  },
  {
    単語: "embrace",
    和訳: "受け入れる",
    難易度: "中級",
    品詞: "動詞",
    文脈: "We should embrace new opportunities. (新しい機会を受け入れるべきだ)",
    動画URL: "https://youtube.com/@VlingualChannel"
  },
  {
    単語: "profound",
    和訳: "深い、深遠な",
    難易度: "上級",
    品詞: "形容詞",
    文脈: "That book had a profound impact on me. (その本は私に深い影響を与えた)",
    動画URL: "https://youtube.com/@VlingualChannel"
  },
  {
    単語: "enhance",
    和訳: "向上させる",
    難易度: "中級",
    品詞: "動詞",
    文脈: "This will enhance your learning experience. (これはあなたの学習体験を向上させる)",
    動画URL: "https://youtube.com/@VlingualChannel"
  },
  {
    単語: "thrive",
    和訳: "繁栄する",
    難易度: "中級",
    品詞: "動詞",
    文脈: "Plants thrive in sunlight. (植物は日光の中で繁栄する)",
    動画URL: "https://youtube.com/@VlingualChannel"
  },
  {
    単語: "eloquent",
    和訳: "雄弁な",
    難易度: "上級",
    品詞: "形容詞",
    文脈: "She gave an eloquent speech. (彼女は雄弁なスピーチをした)",
    動画URL: "https://youtube.com/@VlingualChannel"
  },
  {
    単語: "venture",
    和訳: "冒険する",
    難易度: "中級",
    品詞: "動詞",
    文脈: "Let's venture into new territory. (新しい領域に冒険しよう)",
    動画URL: "https://youtube.com/@VlingualChannel"
  },
  {
    単語: "abundant",
    和訳: "豊富な",
    難易度: "初級",
    品詞: "形容詞",
    文脈: "There are abundant resources available. (利用可能な豊富な資源がある)",
    動画URL: "https://youtube.com/@VlingualChannel"
  },
  {
    単語: "cultivate",
    和訳: "育てる",
    難易度: "中級",
    品詞: "動詞",
    文脈: "We need to cultivate good habits. (良い習慣を育てる必要がある)",
    動画URL: "https://youtube.com/@VlingualChannel"
  }
];

// デフォルトのCSV URL（GitHub Raw）
// GitHub上でCSVを直接編集すれば即反映、再デプロイ不要
export const DEFAULT_CSV_URL = "https://raw.githubusercontent.com/w-udagawa/vlingual-cards/main/public/vocab.csv";

// localStorage キー
export const PROGRESS_STORAGE_KEY = "vocab_progress";
export const AUDIO_ENABLED_KEY = "audio_enabled";
