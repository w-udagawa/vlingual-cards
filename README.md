# Vlingual Cards

**Vlingual Channel**の英語学習語彙をスマホで復習できるPWAアプリ

## 概要

Vlingual Cardsは、YouTubeチャンネル「Vlingual Channel」の英語学習コンテンツで学んだ語彙を効率的に復習するためのフラッシュカードアプリです。

### 主な機能

- ✅ **複数動画対応** - ギャラリー形式で動画を選択、YouTubeサムネイル表示
- ✅ **GitHub連携CSV** - GitHub上のCSVを直接読み込み（編集→即反映、再デプロイ不要）
- ✅ **3Dフリップカード** - タップで表裏を切り替え
- ✅ **スマートスケジューリング** - 未学習カード優先 → スコア順復習
- ✅ **3段階評価** - 覚えてない / だいたいOK / 余裕
- ✅ **音声読み上げ** - 英単語の発音を確認（Web Speech API）
- ✅ **進捗保存** - localStorageで学習履歴を自動保存（動画ごとに個別管理）
- ✅ **レスポンシブデザイン** - スマホ・タブレット・PC対応
- ✅ **PWA対応** - manifest.json実装済み
- ✅ **構造化ログ** - デバッグ用の詳細ログ（DevToolsで確認可能）

## デモ

🌐 **https://vlingual-cards.vercel.app**

スマホ・タブレット・PCのブラウザからアクセスできます。

## 技術スタック

- **フレームワーク**: React 18 + TypeScript
- **ビルドツール**: Vite
- **スタイリング**: カスタムCSS（CSS Variables使用）
- **デプロイ**: Vercel（自動デプロイ）

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

開発サーバーが起動したら、ブラウザで http://localhost:5173/ にアクセスしてください。

### ビルド

```bash
# 本番用ビルド
npm run build

# ビルド結果をプレビュー
npm run preview
```

## デプロイ

### Vercelへのデプロイ（推奨）

このプロジェクトはVercelに自動デプロイされます。

#### 初回デプロイ手順

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

#### 2回目以降のデプロイ

コード変更後、GitHubにpushするだけでOK：

```bash
git add .
git commit -m "Update: 機能追加"
git push origin main
```

Vercelが自動的にビルド・デプロイを実行します（所要時間: 1〜2分）。

## CSVデータ形式

語彙データは以下の形式のCSVファイルで管理します：

```csv
単語,和訳,難易度,品詞,文脈,動画URL,動画タイトル
accomplish,達成する,中級,動詞,"I want to accomplish my goals this year. (今年は目標を達成したい)",https://youtu.be/abc123,英語学習動画
```

### 列の説明

| 列名 | 説明 | 必須 | 例 |
|------|------|------|-----|
| 単語 | 英単語 | ✅ | accomplish |
| 和訳 | 日本語訳 | ✅ | 達成する |
| 難易度 | 初級/中級/上級 | ✅ | 中級 |
| 品詞 | 動詞/形容詞/名詞など | ✅ | 動詞 |
| 文脈 | 例文（英語＋日本語） | ✅ | I want to accomplish my goals this year. (今年は目標を達成したい) |
| 動画URL | 関連動画へのリンク | ✅ | https://youtu.be/abc123 |
| 動画タイトル | 動画のタイトル | ⭕ | 英語学習動画 |

**注意**: 動画タイトル列は省略可能です（6列形式も対応）。省略した場合は「動画1」「動画2」のように自動命名されます。

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

## 複数動画対応（v1.2.0）

### ギャラリー画面

アプリ起動時に複数の動画がある場合、ギャラリー形式の動画選択画面が表示されます。

- **YouTubeサムネイル**: 各動画のサムネイル画像を自動取得・表示
- **語彙数表示**: 各動画に含まれる学習語彙の数を表示
- **全ての動画**: すべての動画の語彙をまとめて学習するオプション

### 動画ごとの進捗管理

進捗データは動画ごとに個別に保存されます：

- 進捗キー: `vocab_progress_${videoId}`
- 各動画の学習状況を独立して管理
- 動画を切り替えても進捗は保持されます

### 使い方

1. **動画選択**: ギャラリー画面でサムネイルをタップ
2. **学習開始**: 選択した動画の語彙カードが表示されます
3. **動画切り替え**: ヘッダー左上の「←」ボタンでギャラリーに戻る（複数動画がある場合のみ表示）

**注意**: 1つの動画のみの場合、ギャラリーをスキップして直接学習画面が開きます。

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

**バージョン**: 1.3.0
**最終更新**: 2025-10-22
**更新内容**:
- Vercelへの移行（GitHub Pagesから）
- アプリ内「使い方」ヘルプモーダル追加
- PWAアイコン実装（SVG形式、192x192 / 512x512）
- PWAインストール促進バナー追加（初回アクセス時表示）
- DISTRIBUTION.md（視聴者向け配布案内）追加
- 自動デプロイ設定（GitHub push時）
