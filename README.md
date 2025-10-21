# Vlingual Cards

**Vlingual Channel**の英語学習語彙をスマホで復習できるPWAアプリ

## 概要

Vlingual Cardsは、YouTubeチャンネル「Vlingual Channel」の英語学習コンテンツで学んだ語彙を効率的に復習するためのフラッシュカードアプリです。

### 主な機能

- ✅ **GitHub連携CSV** - GitHub上のCSVを直接読み込み（編集→即反映、再デプロイ不要）
- ✅ **3Dフリップカード** - タップで表裏を切り替え
- ✅ **スマートスケジューリング** - 未学習カード優先 → スコア順復習
- ✅ **3段階評価** - 覚えてない / だいたいOK / 余裕
- ✅ **音声読み上げ** - 英単語の発音を確認（Web Speech API）
- ✅ **進捗保存** - localStorageで学習履歴を自動保存
- ✅ **レスポンシブデザイン** - スマホ・タブレット・PC対応
- ✅ **PWA対応** - manifest.json実装済み
- ✅ **構造化ログ** - デバッグ用の詳細ログ（DevToolsで確認可能）

## デモ

🌐 **https://w-udagawa.github.io/vlingual-cards/**

スマホ・タブレット・PCのブラウザからアクセスできます。

## 技術スタック

- **フレームワーク**: React 18 + TypeScript
- **ビルドツール**: Vite
- **スタイリング**: カスタムCSS（CSS Variables使用）
- **デプロイ**: GitHub Pages

## ローカル開発

### 前提条件

- Node.js 18以上（推奨: 20以上）
- npm 9以上

### セットアップ

```bash
# リポジトリをクローン
git clone https://github.com/w-udagawa/vlingual-cards.git
cd vlingual-cards

# 依存関係をインストール
npm install

# 開発サーバーを起動
npm run dev
```

開発サーバーが起動したら、ブラウザで http://localhost:5173 にアクセスしてください。

### ビルド

```bash
# 本番用ビルド
npm run build

# ビルド結果をプレビュー
npm run preview
```

## デプロイ

GitHub Pagesにデプロイするには、以下のコマンドを実行します：

```bash
npm run deploy
```

このコマンドは以下を実行します：
1. TypeScriptのコンパイル
2. Viteでの本番ビルド
3. `dist/`ディレクトリを`gh-pages`ブランチにプッシュ

### 初回デプロイ手順

#### 1. GitHubリポジトリを作成

https://github.com/new で新規リポジトリを作成：
- Repository name: `vlingual-cards`
- Public リポジトリとして作成
- **Initialize with README は選択しない**

#### 2. ローカルコードをプッシュ

```bash
cd vlingual-cards

# Gitリポジトリを初期化
git init
git add .
git commit -m "Initial commit: Vlingual Cards Phase 1 MVP"

# GitHubリポジトリと接続
git remote add origin https://github.com/YOUR_USERNAME/vlingual-cards.git
git branch -M main
git push -u origin main
```

#### 3. GitHub Pagesにデプロイ

```bash
npm run deploy
```

このコマンドで `gh-pages` ブランチが自動作成されます。

#### 4. GitHub Pages設定を有効化

GitHubリポジトリで以下を設定：
1. **Settings** タブを開く
2. 左サイドバーから **Pages** を選択
3. **Source**: `Deploy from a branch` を選択
4. **Branch**: `gh-pages` / `/ (root)` を選択
5. **Save** をクリック

数分後、`https://YOUR_USERNAME.github.io/vlingual-cards/` で公開されます。

### 2回目以降のデプロイ

コード変更後、以下を実行するだけでOK：

```bash
npm run deploy
```

## CSVデータ形式

語彙データは以下の形式のCSVファイルで管理します：

```csv
単語,和訳,難易度,品詞,文脈,動画URL
accomplish,達成する,中級,動詞,"I want to accomplish my goals this year. (今年は目標を達成したい)",https://youtube.com/@VlingualChannel
```

### 列の説明

| 列名 | 説明 | 必須 | 例 |
|------|------|------|-----|
| 単語 | 英単語 | ✅ | accomplish |
| 和訳 | 日本語訳 | ✅ | 達成する |
| 難易度 | 初級/中級/上級 | ✅ | 中級 |
| 品詞 | 動詞/形容詞/名詞など | ✅ | 動詞 |
| 文脈 | 例文（英語＋日本語） | ✅ | I want to accomplish my goals this year. (今年は目標を達成したい) |
| 動画URL | 関連動画へのリンク | ✅ | https://youtube.com/@VlingualChannel |

### CSV更新方法（GitHub連携）

**重要**: アプリは`https://raw.githubusercontent.com/w-udagawa/vlingual-cards/main/public/vocab.csv`から直接読み込みます。

#### オンライン編集（推奨）
1. GitHubリポジトリ: https://github.com/w-udagawa/vlingual-cards
2. `public/vocab.csv`をクリック
3. 鉛筆アイコン（Edit）をクリック
4. データを編集
5. "Commit changes"をクリック
6. **即座にアプリに反映**（再デプロイ不要）

#### ローカル編集
1. `public/vocab.csv`を編集
2. `git add public/vocab.csv && git commit -m "Update vocabulary"`
3. `git push origin main`
4. 自動で反映（再デプロイ不要）

#### 注意
- CSVフォーマットを厳守（特に難易度は`初級`/`中級`/`上級`のみ）
- カンマを含む文脈はダブルクォートで囲む

## スマートスケジューリング

学習効率を最大化するため、以下のアルゴリズムで次のカードを選択します：

1. **未学習カード優先** - `seen === 0`のカードがあればランダム選択
2. **スコア降順ソート** - 全て学習済みの場合、スコアの高い順に復習
   - スコア計算式: `seen × 1 + again × 3 - easy`

### 評価の意味

- **覚えてない** (again) - スコア +4 （+1 seen, +3 again）
- **だいたいOK** (ok) - スコア +2 （+1 seen, +1 ok）
- **余裕** (easy) - スコア +0 （+1 seen, +1 easy, -1 スコア）

## 進捗データ

進捗はlocalStorageに以下の形式で保存されます：

```json
{
  "accomplish": {
    "seen": 3,
    "again": 1,
    "ok": 1,
    "easy": 1
  },
  "resilient": {
    "seen": 1,
    "again": 0,
    "ok": 0,
    "easy": 1
  }
}
```

### リセット方法

アプリ下部の「進捗リセット」ボタンをクリックすると、確認ダイアログの後、全ての進捗データが削除されます。

## 音声読み上げ

- **対応ブラウザ**: Chrome、Safari、Edge（Web Speech API対応ブラウザ）
- **言語**: 英語（en-US）
- **速度**: 0.9倍速
- **トグル**: ヘッダーの🔊/🔇アイコンで切り替え
- **デフォルト**: OFF

## ディレクトリ構成

```
vlingual-cards/
├── public/
│   └── manifest.json          # PWAマニフェスト
├── src/
│   ├── App.tsx               # メインコンポーネント
│   ├── App.css               # アプリのスタイル
│   ├── main.tsx              # エントリーポイント
│   ├── index.css             # グローバルスタイル
│   └── types.ts              # TypeScript型定義
├── package.json
├── vite.config.ts            # Vite設定
└── README.md
```

## トラブルシューティング

### CSVが読み込めない

- ネットワーク接続を確認してください
- GitHubのRaw URLが正しいか確認してください（`https://raw.githubusercontent.com/...`）
- エラー画面の「サンプルで試す」ボタンでサンプルデータを使用できます

### 音声が再生されない

- ブラウザがWeb Speech APIに対応しているか確認してください
- 音声トグル（🔊/🔇）がONになっているか確認してください
- ブラウザの音声設定を確認してください

### 進捗が保存されない

- ブラウザのlocalStorageが有効になっているか確認してください
- プライベートブラウジングモードでは保存されません

## ライセンス

MIT License

## 作者

- **開発者**: w-udagawa
- **チャンネル**: [Vlingual Channel](https://youtube.com/@VlingualChannel)

## 謝辞

このアプリは英語学習者の復習効率を向上させることを目的として開発されました。
Vlingual Channelの視聴者の皆様の学習をサポートできれば幸いです。

---

**バージョン**: 1.1.0
**最終更新**: 2025-10-21
**更新内容**:
- GitHub連携CSV（CSV編集→即反映、再デプロイ不要）
- 構造化ログ追加（開発者向けデバッグ機能）
