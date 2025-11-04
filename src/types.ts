// 語彙カードの型定義
export interface VocabCard {
  単語: string;
  和訳: string;
  難易度: '初級' | '中級' | '上級';
  品詞: string;
  文脈: string;
  動画URL: string;
  動画タイトル?: string;  // オプショナル（CSVにない場合も対応）
  事務所?: string;         // オプショナル（事務所名）
  キャスト名?: string;     // オプショナル（キャスト名）
}

// 動画グループ（YouTube動画ごと）
export interface VideoGroup {
  id: string;              // YouTube動画ID
  title: string;           // 動画タイトル
  url: string;             // 元のYouTube URL
  thumbnailUrl: string;    // サムネイルURL
  cards: VocabCard[];      // その動画の語彙リスト
  wordCount: number;       // 語彙数
}

// キャストグループ（Vtuberキャストごと）
export interface CastGroup {
  id: string;              // キャストID（URL用にスラッグ化）
  name: string;            // キャスト名
  agency?: string;         // 事務所名
  videos: VideoGroup[];    // このキャストの動画グループ
  wordCount: number;       // 総語彙数
  thumbnailUrl: string;    // 代表サムネイル（最初の動画のサムネイル）
}

// サンプルデータ（CSV読み込みエラー時のフォールバック用）
export const SAMPLE_DATA: VocabCard[] = [
  {
    単語: "accomplish",
    和訳: "達成する",
    難易度: "中級",
    品詞: "動詞",
    文脈: "I want to accomplish my goals this year. (今年は目標を達成したい)",
    動画URL: "https://youtu.be/dQw4w9WgXcQ",
    動画タイトル: "英語学習 #1",
    事務所: "ホロライブ",
    キャスト名: "がうる・ぐら"
  },
  {
    単語: "resilient",
    和訳: "回復力のある",
    難易度: "上級",
    品詞: "形容詞",
    文脈: "She is resilient in the face of challenges. (彼女は困難に直面しても回復力がある)",
    動画URL: "https://youtu.be/dQw4w9WgXcQ",
    動画タイトル: "英語学習 #1",
    事務所: "ホロライブ",
    キャスト名: "がうる・ぐら"
  },
  {
    単語: "embrace",
    和訳: "受け入れる",
    難易度: "中級",
    品詞: "動詞",
    文脈: "We should embrace new opportunities. (新しい機会を受け入れるべきだ)",
    動画URL: "https://youtu.be/9bZkp7q19f0",
    動画タイトル: "英語学習 #2",
    事務所: "ホロライブ",
    キャスト名: "がうる・ぐら"
  },
  {
    単語: "profound",
    和訳: "深い、深遠な",
    難易度: "上級",
    品詞: "形容詞",
    文脈: "That book had a profound impact on me. (その本は私に深い影響を与えた)",
    動画URL: "https://youtu.be/oHg5SJYRHA0",
    動画タイトル: "英語表現レッスン #1",
    事務所: "ホロライブ",
    キャスト名: "宝鐘マリン"
  },
  {
    単語: "enhance",
    和訳: "向上させる",
    難易度: "中級",
    品詞: "動詞",
    文脈: "This will enhance your learning experience. (これはあなたの学習体験を向上させる)",
    動画URL: "https://youtu.be/oHg5SJYRHA0",
    動画タイトル: "英語表現レッスン #1",
    事務所: "ホロライブ",
    キャスト名: "宝鐘マリン"
  },
  {
    単語: "thrive",
    和訳: "繁栄する",
    難易度: "中級",
    品詞: "動詞",
    文脈: "Plants thrive in sunlight. (植物は日光の中で繁栄する)",
    動画URL: "https://youtu.be/jNQXAC9IVRw",
    動画タイトル: "英会話レッスン #1",
    事務所: "にじさんじ",
    キャスト名: "月ノ美兎"
  },
  {
    単語: "eloquent",
    和訳: "雄弁な",
    難易度: "上級",
    品詞: "形容詞",
    文脈: "She gave an eloquent speech. (彼女は雄弁なスピーチをした)",
    動画URL: "https://youtu.be/jNQXAC9IVRw",
    動画タイトル: "英会話レッスン #1",
    事務所: "にじさんじ",
    キャスト名: "月ノ美兎"
  },
  {
    単語: "venture",
    和訳: "冒険する",
    難易度: "中級",
    品詞: "動詞",
    文脈: "Let's venture into new territory. (新しい領域に冒険しよう)",
    動画URL: "https://youtu.be/jNQXAC9IVRw",
    動画タイトル: "英会話レッスン #1",
    事務所: "にじさんじ",
    キャスト名: "月ノ美兎"
  },
  {
    単語: "abundant",
    和訳: "豊富な",
    難易度: "初級",
    品詞: "形容詞",
    文脈: "There are abundant resources available. (利用可能な豊富な資源がある)",
    動画URL: "https://youtu.be/oHg5SJYRHA0",
    動画タイトル: "英語表現レッスン #1",
    事務所: "ホロライブ",
    キャスト名: "宝鐘マリン"
  },
  {
    単語: "cultivate",
    和訳: "育てる",
    難易度: "中級",
    品詞: "動詞",
    文脈: "We need to cultivate good habits. (良い習慣を育てる必要がある)",
    動画URL: "https://youtu.be/9bZkp7q19f0",
    動画タイトル: "英語学習 #2",
    事務所: "ホロライブ",
    キャスト名: "がうる・ぐら"
  }
];

// デフォルトのCSV URL
// Vercelの public/ ディレクトリからCSVを読み込み
export const DEFAULT_CSV_URL = "/vocab.csv";

// localStorage キー
export const AUDIO_ENABLED_KEY = "audio_enabled";
export const THEME_PREFERENCE_KEY = "theme_preference";
export const AGENCY_ORDER_KEY = "agency_order";
export const VOCABULARY_CHECKED_KEY = "vocabulary_checked";
