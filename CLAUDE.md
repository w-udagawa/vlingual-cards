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

**src/App.tsx** (~700行):
- CSV読み込み・解析
- カード表示・フリップ制御
- 評価システム（3段階）
- シンプルなランダム選択
- セッション管理（メモリ内のみ）
- 音声読み上げ（Web Speech API）
- 完了メッセージ表示

**src/types.ts**:
- `VocabCard`: CSV行のデータ構造
- `VideoGroup`: 動画ごとのグループ化
- `SAMPLE_DATA`: フォールバック用10単語
- `DEFAULT_CSV_URL`: Vercel `/vocab.csv` への定数
- `AUDIO_ENABLED_KEY`: 音声設定用のlocalStorageキー

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
動画ごとにグループ化 → VideoGroup[]
  ↓
動画選択 → セッション開始（mastered: Set<string> = 空）
  ↓
selectNextCard() でランダム選択（「余裕」以外から）
  ↓
カード表示 → 評価
  - 「余裕」タップ → mastered に追加 → カード非表示
  - その他 → カード継続表示
  ↓
次のカード選択（ループ）
  ↓
全て「余裕」→ 🎉完了メッセージ
  ↓
ページを閉じる/リロード → セッションリセット（最初から）
```

### Learning Model (v2.0.0)

**シンプルなセッション制学習**:
- **ゴール**: 1つの動画の全単語を「余裕」にすること
- **評価の効果**:
  - 🔴 **覚えてない** / 🟡 **だいたいOK**: カードが何度も出現
  - 🟢 **余裕**: そのセッション中は非表示（`mastered` Setに追加）
- **ランダム選択**: 「余裕」以外のカードからランダムに選択（スコアリングなし）
- **セッション管理**: ページを閉じると記録リセット、次回は最初から

App.tsx の `selectNextCard()` 関数:
```typescript
const selectNextCard = (allCards: VocabCard[]): VocabCard | null => {
  // 「余裕」にしていないカードをフィルター
  const availableCards = allCards.filter(card => !mastered.has(card.単語));

  if (availableCards.length === 0) {
    return null; // 全て「余裕」になった
  }

  // ランダムに選択
  return availableCards[Math.floor(Math.random() * availableCards.length)];
};
```

### Session Storage

**セッション管理（メモリ内）**:
- `mastered: Set<string>` - 「余裕」にした単語のSet（State変数）
- ページを閉じる/リロード → 自動リセット
- 動画を切り替え → 自動リセット

**永続保存（localStorage）**:
- `audio_enabled`: 音声読み上げON/OFF（boolean文字列）のみ保存

**設計思想**:
- **集中学習を促進**: 1つの動画を「やり切る」モチベーション
- **シンプルさ**: 複雑な進捗管理なし、わかりやすい学習フロー
- **新鮮さ**: 毎回最初から、反復学習に最適

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
import type { VocabCard, VideoGroup } from './types';
import { SAMPLE_DATA, DEFAULT_CSV_URL, AUDIO_ENABLED_KEY } from './types';

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
  url: "/vocab.csv",
  status: "success",
  cardCount: 50,
  timestamp: "2025-10-30T13:04:11.708Z"
}

[CARD_SELECT] {
  operation: "selectNextCard",
  word: "accomplish",
  remaining: 25,  // 残りカード数
  total: 50,      // 総カード数
  timestamp: "2025-10-30T13:04:11.709Z"
}

[CARD_RATE] {
  operation: "handleRate",
  word: "accomplish",
  rating: "easy",  // "again" | "ok" | "easy"
  mastered: true,  // 「余裕」の場合のみ true
  remaining: 24,   // 残りカード数（「余裕」の場合）
  timestamp: "2025-10-30T13:04:15.123Z"
}
```

**ログの見方**:
- `[CSV_LOAD]`: CSV読み込みの成功/失敗、単語数
- `[CARD_SELECT]`: 選択されたカードと残りカード数
- `[CARD_RATE]`: 評価とマスター状態（「余裕」かどうか）

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

### Session Management (v2.0.0)

**セッション制学習**:
- 動画選択時に新しいセッション開始
- `mastered: Set<string>` を空でリセット
- ページを閉じる/リロードで自動リセット
- 永続保存なし（意図的な設計）

**利点**:
- シンプルで分かりやすい
- 毎回新鮮な気持ちで学習開始
- 「全て余裕にする」という明確なゴール

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

**Phase 3 (オプション機能)**:
- 進捗の永続保存（オプション設定で有効化）
- 統計表示（セッション内での学習回数など）
- カスタムCSVアップロード機能

---

**Version**: 2.0.0
**Last Updated**: 2025-10-30

**Changes (v2.0.0 - 2025-10-30) - 🎉 大規模リファクタリング**:
- **シンプルなセッション制学習モデルへ変更**:
  - 複雑なスコアリングアルゴリズムを廃止
  - 「余裕」タップ → 即座に非表示（シンプルなランダム選択）
  - ページを閉じるとリセット（セッション管理）
- **進捗保存の廃止**:
  - localStorageへの永続保存を削除（音声設定のみ保持）
  - `mastered: Set<string>` でセッション内管理
- **UI改善**:
  - ヘッダーに「残り○/○枚」の進捗表示を追加
  - 全て「余裕」にすると🎉完了メッセージ表示
  - 「覚えてない」フィルター機能を削除（不要に）
- **ヘルプモーダル更新**:
  - 新しい学習モデルの説明に変更
  - セッション管理の説明を追加
- **コード削減**:
  - 約200行のコード削減（Progress/ProgressData型削除、複雑なロジック削除）
- **設計思想**:
  - 「1つの動画を集中してやり切る」モチベーション向上
  - シンプルで分かりやすい学習フロー
  - 毎回新鮮な気持ちで反復学習

**Changes (v1.3.1 - 2025-10-25)**:
- チャンネルロゴ統合
- カードフリップの裏面透過問題を修正（backface-visibility）

**Changes (v1.3.0 - 2025-10-22)**:
- Vercelへの移行
- ヘルプモーダル追加
- PWAインストール促進バナー追加
