# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Vlingual Cards** は、YouTubeチャンネル「Vlingual Channel」の英語学習語彙を復習するためのPWAフラッシュカードアプリです。React 18 + TypeScript + Viteで構築されています。

## Essential Commands

```bash
# 開発サーバー起動（http://localhost:5173/vlingual-cards/）
npm run dev

# 本番ビルド（TypeScriptコンパイル + Viteビルド）
npm run build

# ビルド結果のプレビュー
npm run preview

# ESLint実行
npm run lint

# GitHub Pagesへデプロイ（ビルド + gh-pagesブランチへpush）
npm run deploy
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
base: '/vlingual-cards/' // GitHub Pages用のベースパス
```

**重要**: リポジトリ名が変わる場合、このbaseを変更する必要があります。

### CSV Data Source (types.ts)

```typescript
DEFAULT_CSV_URL = "https://raw.githubusercontent.com/w-udagawa/vlingual-cards/main/vocab.csv"
```

CSV形式:
```
単語,和訳,難易度,品詞,文脈,動画URL
accomplish,達成する,中級,動詞,"例文 (日本語訳)",https://youtube.com/@VlingualChannel
```

- 難易度: 必ず `初級` / `中級` / `上級` のいずれか
- 文脈にカンマや改行がある場合はダブルクォートで囲む
- エスケープされたクォート（`""`）に対応

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
- `start_url: "/vlingual-cards/"` - GitHub Pagesのベースパスと一致
- `display: "standalone"` - アプリモード
- アイコンは未実装（Phase 2予定）

## Deployment

### GitHub Pages Setup

1. GitHubリポジトリ作成
2. Settings > Pages > Source: **gh-pages branch** を選択
3. `npm run deploy` 実行
4. 数分後に `https://<username>.github.io/vlingual-cards/` で公開

### Deploy Command Details

```bash
npm run deploy
# = npm run build && gh-pages -d dist
```

1. `tsc -b`: TypeScriptコンパイル
2. `vite build`: 本番ビルド（dist/に出力）
3. `gh-pages -d dist`: dist/を gh-pages ブランチにpush

## Troubleshooting

### Vite Dev Server Error

`crypto.hash is not a function` エラーが出る場合:
- Node.js 18未満を使用している可能性
- Node.js 18.19.1以上にアップグレード

### CSV Parse Error

- `types.ts` の `SAMPLE_DATA` がフォールバックとして使用される
- エラー画面に「サンプルで試す」ボタンが表示される
- CSV形式が正しいか確認（特に難易度の値）

### Build Warning (Node.js Version)

```
You are using Node.js 18.19.1. Vite requires Node.js version 20.19+ or 22.12+.
```

- これは警告のみで、Vite 5.4.21 はNode.js 18で正常動作します
- ビルドが成功していれば問題なし

## Future Enhancements (Not Implemented)

**Phase 2 (PWA化)**:
- Service Worker（オフライン対応）
- アイコン画像（192px, 512px）

**Phase 3 (拡張機能)**:
- 統計ダッシュボード
- 複数CSVの切り替え
- エクスポート機能

---

**Version**: 1.0.0
**Last Updated**: 2025-10-21
