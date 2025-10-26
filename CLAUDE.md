# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Vlingual Cards** は、YouTubeチャンネル「Vlingual Channel」の英語学習語彙を復習するためのPWAフラッシュカードアプリです。React 18 + TypeScript + Viteで構築されています。

## Essential Commands

```bash
# 開発サーバー起動（http://localhost:5173/）
npm run dev

# 本番ビルド（TypeScriptコンパイル + Viteビルド）
npm run build

# ビルド結果のプレビュー
npm run preview

# ESLint実行
npm run lint

# デプロイ: GitHubにpushすると自動的にVercelがビルド・デプロイ
git push origin main
```

## Architecture

### Single Component Architecture
このアプリは **App.tsx** に全てのロジックを集約したシンプルな構造です。コンポーネント分割は意図的に行っていません。

**src/App.tsx** (385行):
- CSV読み込み・解析
- カード表示・フリップ制御
- 評価システム（3段階）
- スマートスケジューリング
- 進捗保存（localStorage）
- 音声読み上げ（Web Speech API）

**src/types.ts**:
- `VocabCard`: CSV行のデータ構造
- `Progress`: 単語ごとの学習進捗（seen/again/ok/easy）
- `ProgressData`: Record<単語, Progress>
- `SAMPLE_DATA`: フォールバック用10単語
- `DEFAULT_CSV_URL`: GitHub Raw URLへの定数

### Data Flow

```
起動時
  ↓
DEFAULT_CSV_URL からCSV取得
  ↓ (失敗時)
SAMPLE_DATA にフォールバック
  ↓
parseCSV() で VocabCard[] に変換
  ↓
selectNextCard() でスケジューリング
  ↓
カード表示 → 評価 → 進捗更新 → 次のカード
```

### Scheduling Algorithm

App.tsx の `selectNextCard()` 関数:
1. **未学習カード優先**: `seen === 0` のカードをランダム選択
2. **スコア降順ソート**: 全て学習済みなら `score = seen × 1 + again × 3 - easy` で計算し、スコアの高い順に復習

### Progress Storage

localStorage に以下のキーで保存:
- `vocab_progress`: 単語ごとの進捗データ（JSON）
- `audio_enabled`: 音声読み上げON/OFF（boolean文字列）

## Configuration

### Vite Config (vite.config.ts)

```typescript
base: '/' // Vercel用のベースパス（ルート配置）
```

**重要**: Vercelはルートパスにデプロイされるため、`base: '/'` を使用します。GitHub Pagesの場合は `base: '/vlingual-cards/'` が必要でした。

### CSV Data Source (types.ts)

**Vercel連携**: アプリは Vercel の `/vocab.csv` からCSVを読み込みます。

```typescript
DEFAULT_CSV_URL = "/vocab.csv"
```

**CSV更新ワークフロー**:
1. GitHub Web UI で `public/vocab.csv` を編集
2. コミット → GitHubにpush
3. Vercel が自動的にビルド・デプロイ（**1〜2分で反映**）

CSV形式（7列または6列）:
```
単語,和訳,難易度,品詞,文脈,動画URL,動画タイトル
accomplish,達成する,中級,動詞,"例文 (日本語訳)",https://youtu.be/abc123,英語学習動画
```

**必須ルール**:
- 難易度: 必ず `初級` / `中級` / `上級` のいずれか
- 文脈にカンマや改行がある場合はダブルクォートで囲む
- エスケープされたクォート（`""`）に対応
- 動画タイトル列は省略可能（6列形式も対応）

### Node.js Version Compatibility

**重要**: Vite 5.4.21を使用しているため、Node.js 18.x で動作します。
- Vite 7.x は Node.js 20.19+ が必要なため、意図的にダウングレード済み
- React 18.3.1 を使用（React 19ではなく）

## Styling

カスタムCSS（Tailwind CSS不使用）:
- `src/index.css`: グローバルスタイル、CSS Variables定義
- `src/App.css`: コンポーネントスタイル、3Dフリップアニメーション

**カラーパレット** (CSS Variables):
```css
--primary: #a855f7;          /* パープル */
--background: #0f0f1a;       /* ダークブルー */
--card-bg: #1a1a2e;          /* ダークグレー */
--level-beginner: #10b981;   /* 初級 = グリーン */
--level-intermediate: #f59e0b; /* 中級 = オレンジ */
--level-advanced: #ef4444;   /* 上級 = レッド */
```

## TypeScript Import Rules

**重要**: `verbatimModuleSyntax` が有効なため、型のみのインポートは `import type` を使用:

```typescript
// 正しい
import type { VocabCard, ProgressData, Progress } from './types';
import { SAMPLE_DATA, DEFAULT_CSV_URL } from './types';

// 誤り（ビルドエラー）
import { VocabCard, SAMPLE_DATA } from './types';
```

## PWA Configuration

`public/manifest.json`:
- `start_url: "/"` - Vercel用のルートパス
- `display: "standalone"` - アプリモード
- アイコン実装済み（チャンネルロゴJPG、192x192 / 512x512）

**PWA Features**:
- ヘルプモーダル（「?」ボタンで使い方を表示）
- インストール促進バナー（初回アクセス時、3秒後に表示）
- ホーム画面追加でネイティブアプリのような体験

## Deployment

### Live Demo

🌐 **https://vlingual-cards.vercel.app**

### Vercel Setup

#### 初回デプロイ

1. **Vercelアカウント作成**: https://vercel.com/signup
2. **GitHubリポジトリと連携**:
   - Vercel ダッシュボードで「New Project」をクリック
   - GitHubリポジトリ `w-udagawa/vlingual-cards` を選択
   - **Framework Preset**: Vite が自動検出される
   - **Build Command**: `npm run build` （自動設定）
   - **Output Directory**: `dist` （自動設定）
   - 「Deploy」をクリック

3. **デプロイ完了**:
   - 数分後に `https://vlingual-cards.vercel.app` で公開されます
   - 以降、`main` ブランチへのpush時に自動デプロイ

#### 2回目以降

GitHubにpushするだけ：

```bash
git add .
git commit -m "Update: 機能追加"
git push origin main
```

Vercelが自動的にビルド・デプロイを実行します（所要時間: 1〜2分）。

### Deploy Workflow

```
git push origin main
  ↓
Vercel が自動検知
  ↓
npm run build を実行（Vercelサーバー上）
  ↓
dist/ を本番環境にデプロイ
  ↓
https://vlingual-cards.vercel.app に反映
```

**自動デプロイの利点**:
- GitHub Pagesの5分 → Vercelの1〜2分
- プレビューデプロイ（PRごとに専用URL生成）
- ビルドログの詳細表示
- ロールバックが簡単（ダッシュボードから1クリック）

## Debugging

### 構造化ログ（vibelogger風）

ブラウザのDevToolsコンソールで以下のログを確認できます：

```javascript
[CSV_LOAD] {
  operation: "loadCSV",
  url: "https://raw.githubusercontent.com/.../vocab.csv",
  status: "success",
  cardCount: 20,
  timestamp: "2025-10-21T13:04:11.708Z"
}

[CARD_SELECT] {
  operation: "selectNextCard",
  strategy: "unseen",  // または "score"
  word: "accomplish",
  unseenCount: 10,     // または score
  timestamp: "2025-10-21T13:04:11.709Z"
}

[CARD_RATE] {
  operation: "handleRate",
  word: "accomplish",
  rating: "ok",  // "again" | "ok" | "easy"
  previousProgress: { seen: 0, again: 0, ok: 0, easy: 0 },
  newProgress: { seen: 1, again: 0, ok: 1, easy: 0 },
  timestamp: "2025-10-21T13:04:15.123Z"
}
```

**ログの見方**:
- `[CSV_LOAD]`: CSV読み込みの成功/失敗、単語数
- `[CARD_SELECT]`: どの戦略でカードが選ばれたか
- `[CARD_RATE]`: 評価の履歴と進捗の変化

## Troubleshooting

### Vite Dev Server Error

`crypto.hash is not a function` エラーが出る場合:
- Node.js 18未満を使用している可能性
- Node.js 18.19.1以上にアップグレード

### CSV Parse Error

- `types.ts` の `SAMPLE_DATA` がフォールバックとして使用される
- エラー画面に「サンプルで試す」ボタンが表示される
- CSV形式が正しいか確認（特に難易度の値）
- DevToolsコンソールで `[CSV_LOAD]` ログを確認

### Browser Cache Issues

デプロイ後に変更が反映されない場合:
- ハードリロード: Ctrl+Shift+R (Windows) / Cmd+Shift+R (Mac)
- シークレットウィンドウで開く
- ブラウザキャッシュをクリア

### Build Warning (Node.js Version)

```
You are using Node.js 18.19.1. Vite requires Node.js version 20.19+ or 22.12+.
```

- これは警告のみで、Vite 5.4.21 はNode.js 18で正常動作します
- ビルドが成功していれば問題なし

## Multi-Video Support (v1.2.0)

### Architecture Overview

**Dual-Screen Design**:
- **Gallery Screen**: Video selection with YouTube thumbnails
- **Study Screen**: Flashcard learning interface

**Key Components**:
```typescript
// src/types.ts - Line 23-30
export interface VideoGroup {
  id: string;              // YouTube video ID (extracted from URL)
  title: string;           // Video title (auto-generated: "動画1", "動画2", etc.)
  url: string;             // Original YouTube URL
  thumbnailUrl: string;    // YouTube thumbnail (mqdefault.jpg)
  cards: VocabCard[];      // Vocabulary cards for this video
  wordCount: number;       // Number of vocabulary items
}
```

### YouTube ID Extraction

**Supported URL Formats** (App.tsx:11-22):
- `https://youtu.be/{VIDEO_ID}`
- `https://youtube.com/watch?v={VIDEO_ID}`
- `https://youtube.com/embed/{VIDEO_ID}`

**Thumbnail URL**: `https://img.youtube.com/vi/{VIDEO_ID}/mqdefault.jpg`
- No API key required
- Direct CDN access

### Data Grouping Logic (App.tsx:115-143)

```typescript
const groupCardsByVideo = (cards: VocabCard[]): VideoGroup[] => {
  const grouped = new Map<string, VideoGroup>();

  cards.forEach(card => {
    const videoId = extractYouTubeId(card.動画URL);
    if (!videoId) return; // Skip invalid URLs

    if (!grouped.has(videoId)) {
      grouped.set(videoId, {
        id: videoId,
        title: card.動画タイトル || `動画${grouped.size + 1}`,  // CSVからタイトル取得、なければフォールバック
        url: card.動画URL,
        thumbnailUrl: getThumbnailUrl(videoId),
        cards: [],
        wordCount: 0
      });
    }

    const group = grouped.get(videoId)!;
    group.cards.push(card);
    group.wordCount++;
  });

  return Array.from(grouped.values());
};
```

### State Management

**New State Variables** (App.tsx:30-41):
- `screen: 'gallery' | 'study'` - Current screen
- `allVideos: VideoGroup[]` - All video groups
- `selectedVideo: VideoGroup | null` - Currently selected video

**Navigation Flow**:
1. Load CSV → Group by video URL → Set `allVideos`
2. If `allVideos.length > 1` → Show gallery
3. If `allVideos.length === 1` → Auto-navigate to study
4. User selects video → Switch to study screen
5. Back button (visible if multiple videos) → Return to gallery

### Video-Specific Progress Storage

**localStorage Keys**:
- Global: `vocab_progress` (backward compatibility)
- Per-video: `vocab_progress_${videoId}`

**Behavior** (App.tsx:329-367):
- When selecting a video: Load `vocab_progress_${videoId}`
- When selecting "All Videos": Load global `vocab_progress`
- Progress isolation: Each video maintains independent learning state

### Gallery UI (App.css:267-416)

**Responsive Grid**:
- Desktop: `repeat(auto-fill, minmax(280px, 1fr))`
- Tablet (≤768px): `minmax(240px, 1fr)`
- Mobile (≤480px): `1fr` (single column)

**Video Card Styles**:
- Thumbnail: 320×180px (16:9 aspect ratio)
- Hover effect: `translateY(-4px)` with purple border
- "All Videos" card: Purple gradient background with 📚 icon

**Back Button** (App.css:392-404):
- Positioned in header-left
- Only visible if `allVideos.length > 1`
- Purple color with hover effect

### CSV Format Requirements

**7列形式（推奨）**:
```csv
単語,和訳,難易度,品詞,文脈,動画URL,動画タイトル
word1,訳1,初級,名詞,"Example 1",https://youtu.be/VIDEO_ID_1,動画タイトル1
word2,訳2,中級,動詞,"Example 2",https://youtu.be/VIDEO_ID_1,動画タイトル1
word3,訳3,上級,形容詞,"Example 3",https://youtu.be/VIDEO_ID_2,動画タイトル2
```

**6列形式（後方互換）**:
```csv
単語,和訳,難易度,品詞,文脈,動画URL
word1,訳1,初級,名詞,"Example 1",https://youtu.be/VIDEO_ID_1
word2,訳2,中級,動詞,"Example 2",https://youtu.be/VIDEO_ID_1
```

**Grouping**: All cards with the same `動画URL` are grouped together. Video titles are read from CSV (7-column format) or auto-generated (6-column format).

## Future Enhancements (Not Implemented)

**Phase 2 (PWA完全対応)**:
- Service Worker（オフライン対応、キャッシング）

**Phase 3 (拡張機能)**:
- 統計ダッシュボード（学習進捗のグラフ化）
- エクスポート機能（CSV/JSON形式で進捗データ出力）
- 動画タイトルの手動編集機能（ギャラリー画面で直接編集）

---

**Version**: 1.3.1
**Last Updated**: 2025-10-25
**Changes (v1.3.1)**:
- チャンネルロゴ統合: アプリヘッダーにチャンネルロゴを表示（"VL"テキストロゴを置き換え）
- PWAアイコンをSVG形式からチャンネルロゴJPG形式に変更（192x192 / 512x512）
- ホーム画面追加時にチャンネルロゴが表示されるように改善

**Changes (v1.3.0 - 2025-10-22)**:
- Vercelへの移行（GitHub Pagesから）
- アプリ内「使い方」ヘルプモーダル追加（「?」ボタン）
- PWAアイコン実装（SVG形式、192x192 / 512x512）
- PWAインストール促進バナー追加（初回アクセス時、3秒後に表示）
- DISTRIBUTION.md（視聴者向け配布案内）追加
- 自動デプロイ設定（GitHub push時にVercelが自動ビルド・デプロイ）
- base path変更（`/vlingual-cards/` → `/`）
