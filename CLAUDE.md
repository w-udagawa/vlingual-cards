# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Vlingual Cards** は、YouTubeチャンネル「Vlingual Channel」の英語学習語彙を復習するためのPWAフラッシュカードアプリです。React 18 + TypeScript + Viteで構築されています。

- 本番URL: **https://vlingual-cards.vercel.app**
- 収録カード数: 672（`public/vocab.csv`）
- アカウント不要・無料・広告なし。進捗はブラウザ（localStorage）に保存
- Vercel Analytics導入済み（Cookieレス）

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

# ユニットテスト（vitest、62テスト）
npm test

# CSV品質チェック（列数・難易度・タイトル揺れ・重複などを検査）
npm run validate-csv

# デプロイ: GitHubにpushすると自動的にVercelがビルド・デプロイ（1〜2分）
git push origin main
```

GitHub Actions（`.github/workflows/validate-csv.yml`）が `public/vocab.csv` 等のpush時に `validate-csv --ci` を実行し、**非ブロッキング**の警告アノテーションを付けます（失敗してもVercelのデプロイは止まりません）。

## Architecture

### App.tsx + 純関数ライブラリ

UIは **src/App.tsx** に集約し、ロジックは **src/lib/** の純関数に分離しています。

**src/App.tsx**（UI集約）:
- 画面遷移（キャスト一覧 → 動画一覧 → 学習画面）
- カード表示・フリップ・スライドアニメーション
- 評価ボタン（3段階）と出題キューの駆動
- 音声読み上げ（Web Speech API）+ カード裏面の🔊リプレイボタン
- 語彙一覧モーダル・ヘルプモーダル・PWAインストールバナー
- テーマ切替（ダーク/ライト）、事務所の並び替え
- ディープリンク処理（`?video=` / `?cast=`）

**src/lib/**（純関数。副作用はstore.tsのlocalStorage入出力のみ）:
| ファイル | 責務 | 主な関数 |
|---|---|---|
| `csv.ts` | RFC4180準拠CSVパーサ、YouTube ID抽出、カードID付与 | `parseCsvRows` / `parseVocabCsv` / `extractYouTubeId` / `attachCardIds` |
| `ids.ts` | カードID導出（唯一の定義箇所） | `cardId` / `normalizeWord` |
| `schedule.ts` | Leitner 5箱の状態遷移・日付計算 | `applyRating` / `todayLocal` / `isDue` / `isMastered` |
| `session.ts` | セット構成・出題キュー・再挿入 | `buildStudySet` / `buildReviewSet` / `reinsert` / `countDue` |
| `store.ts` | localStorage永続化・マージ・移行・エクスポート/インポート | `loadStore` / `saveStore` / `migrateLegacyChecked` / `exportProgress` / `importProgress` |

**テスト**: `src/lib/__tests__/`（csv / schedule / session / store）。`npm test` で実行。

**src/types.ts**:
- `VocabCardInput`: CSV1行分（IDなし）
- `VocabCard`: アプリ内部表現（`id` + `videoId` 付き）
- `VideoGroup` / `CastGroup`: 動画・キャストごとのグループ化
- `SAMPLE_DATA`: フォールバック用10単語（使用時は `attachCardIds()` でID付与）
- `DEFAULT_CSV_URL`: `/vocab.csv`
- localStorageキー定数

### Navigation Flow（3階層 + ディープリンク）

```
キャスト一覧（ホーム） ──▶ 動画一覧 ──▶ 学習画面
     │
     └─ 🔁 今日の復習（N枚） ──▶ 学習画面（復習スコープ）
```

- ホームに「🔁 今日の復習（N枚）」導線: **全動画横断・due到来カードのみ・上限30枚・新規なし**。N=0なら非表示
- ディープリンク: `https://vlingual-cards.vercel.app/?video=<YouTube動画ID>` で動画の学習画面に直行（概要欄・固定コメントに貼れる）。`?cast=<キャスト名>` も動作。`App.tsx` の `handleSelectCast` / `handleSelectVideo` が `history.pushState` でURLを同期し、popstateで戻る操作にも追従
- 戻るボタンは常に表示

## Learning Model (v3.0.0) — 正典は docs/learning-model.md

**[docs/learning-model.md](docs/learning-model.md) が学習モデル・カードID・ストレージの唯一の正典です。** コード・ヘルプ・このファイルが正典と食い違う場合、正典に合わせて直すこと。詳細（状態機械・遷移表・ストレージスキーマ）はここに二重記述しません。以下は要約のみ:

- **ハイブリッド学習モデル**: 進捗はlocalStorage（キー `vlc_learning_v1`）に永続保存。裏側はLeitner 5箱の間隔反復だが、**UIにSRS用語（箱・間隔・忘却曲線）は出さない**
- ユーザー向け説明はこれだけ: 「🔴すぐまた出る / 🟡しばらくしてまた出る / 🟢余裕=当分出ない」+「記録が進むのは1日1回」+「忘れかけた頃に今日の復習に出てくる」（原文は正典末尾）
- **1セット = 最大20枚**。大きい動画は自動的に複数セットに分かれる（セット番号はUIに見せない）
- 評価後のセット内再出題: 覚えてない→**3枚後** / だいたいOK→**8枚後** / 余裕→出ない
- **セッション復帰**: 評価のたびにキューをストアへ書き戻すため、リロード/アプリ切替でも同日・同スコープなら続きから復帰する
- **完了画面**: 🎉 +「明日はN枚が復習に来ます」+ 主ボタン「▶ この動画をもう一度見る」+「次のセットへ」。`confirm()` ダイアログと「進捗リセット」ボタンは廃止済み
- **語彙一覧の「覚えた」チェック = 出題停止スイッチ**（学習進捗と完全統合）。「余裕」を積み上げたカードは自動でチェックが付く。外すと再出題対象に戻る
- **学習データの引っ越し**: ヘルプモーダルから進捗のエクスポート/インポート（JSONコピペ）が可能

## Storage (localStorage)

| キー | 内容 |
|---|---|
| `vlc_learning_v1` | 学習進捗ストア（カード状態 + アクティブセッション）。スキーマは正典参照 |
| `audio_enabled` | 音声読み上げON/OFF |
| `theme_preference` | ダーク/ライトテーマ |
| `agency_order` | 事務所の表示順 |
| `install_banner_dismissed` | PWAインストールバナーを閉じたか |
| `vlc_learning_v1_backup` | 破損・version不一致で読めなかった進捗データの退避先（自動生成・通常は存在しない） |
| `vocabulary_checked` | **旧進捗キー（読み取りのみ）**。初回に `vlc_learning_v1` へ移行済み。ロールバック安全弁として削除しない |

キー定数は `src/types.ts`（`LEARNING_STORE_KEY` のみ `src/lib/store.ts`）に定義。

## CSV Data Source

### 仕様（9列推奨）

```csv
単語,和訳,難易度,品詞,文脈,動画URL,動画タイトル,事務所,キャスト名
accomplish,達成する,中級,動詞,"例文 (日本語訳)",https://youtu.be/abc123,動画タイトル,ホロライブ,がうる・ぐら
```

**パーサ（`src/lib/csv.ts` の `parseVocabCsv`）の特性**:
- RFC4180準拠（ダブルクォート・エスケープ `""`・クォート内カンマ/改行に対応）
- **ヘッダー名ベース**で列を解決。6列/7列/9列の後方互換あり、未知の追加列にも耐える
- 不正行は無言スキップせず、**件数をUIバナーに表示**する
- 同一動画内の重複行（同じ単語）は自動で初出行に統合
- 品詞「スラング」を正式サポート

**必須ルール**:
- 難易度: 必ず `初級` / `中級` / `上級` のいずれか
- 文脈にカンマや改行がある場合はダブルクォートで囲む
- **同一動画のタイトルは全行同じにする**（揺れたら初出行が採用され、`npm run validate-csv` が警告する）

### 更新ワークフロー

1. GitHub Web UI で `public/vocab.csv` を編集
2. コミット → push（GitHub ActionsがCSVを自動検査、警告は非ブロッキング）
3. Vercel が自動的にビルド・デプロイ（**1〜2分で反映**）

**設計原則**: CSVは読み取り専用の教材。ID列・進捗列はCSVに追加しない（カードIDは `src/lib/ids.ts` で導出）。

### YouTube ID / サムネイル

- 対応URL形式（`extractYouTubeId`）: `youtu.be/{ID}` / `youtube.com/watch?v={ID}` / `youtube.com/embed/{ID}`
- サムネイル: `https://img.youtube.com/vi/{VIDEO_ID}/mqdefault.jpg`（APIキー不要、CDN直参照）
- グループ化: `App.tsx` の `groupCardsByVideo` / `groupCardsByCast`

## Configuration

### Vite Config (vite.config.ts)

```typescript
base: '/' // Vercelはルートパスにデプロイされるため
```

### Node.js Version Compatibility

**重要**: Vite 5.4.21を使用しているため、Node.js 18.x で動作します。
- Vite 7.x は Node.js 20.19+ が必要なため、意図的にVite 5に留めている
- React 18.3.1 を使用（React 19ではない）
- ビルド時の「Vite requires Node.js version 20.19+」は警告のみで、ビルドが成功していれば問題なし

## TypeScript Import Rules

**重要**: `verbatimModuleSyntax` が有効なため、型のみのインポートは `import type` を使用:

```typescript
// 正しい
import type { VocabCard, VideoGroup } from './types';
import { SAMPLE_DATA, DEFAULT_CSV_URL, AUDIO_ENABLED_KEY } from './types';

// 誤り（ビルドエラー）
import { VocabCard, SAMPLE_DATA } from './types';
```

## Styling

カスタムCSS（Tailwind CSS不使用）:
- `src/index.css`: グローバルスタイル、CSS Variables定義（ダーク/ライト両テーマ）
- `src/App.css`: コンポーネントスタイル、3Dフリップアニメーション、スライドアニメーション

カード遷移は CSS `animation` のみ使用（`transition` と併用するとモバイルでちらつくため）。タイミング制御は `App.tsx` の `handleRate` 内の `setTimeout`。

## PWA

`public/manifest.json`:
- `start_url: "/"` / `display: "standalone"`
- アイコンはチャンネルロゴJPG（192x192 / 512x512）

**機能**:
- ヘルプモーダル（使い方 + 学習データの引っ越し）
- インストール促進バナー（**インストール済み=standalone表示なら出ない**。閉じたら `install_banner_dismissed` に記録）
- **Service Workerは未実装 → オフラインは非対応（Phase 2予定）**

## Deployment

GitHubにpushするだけ:

```bash
git add .
git commit -m "Update: 機能追加"
git push origin main
```

Vercelが自動検知して `npm run build` を実行し、`dist/` を本番環境にデプロイします（所要時間: 1〜2分）。プレビューデプロイ（PRごとに専用URL）、ロールバック（ダッシュボードから1クリック）に対応。

## Debugging

DevToolsコンソールの構造化ログ:

- `[CSV_LOAD]`（成功）/ `[CARD_RATE]`: **開発ビルドのみ**（`App.tsx` の `devLog` 経由。本番には出ない）
- `[CSV_LOAD]`（エラー）/ `[CSV_WARN]`（不正行の詳細）/ `[STORE]`（進捗データ退避）: **本番でも出る**（意図的。UIバナーが「詳細はブラウザのコンソール」と案内するため）

## Troubleshooting

### Vite Dev Server Error

`crypto.hash is not a function` エラーが出る場合:
- Node.js 18未満を使用している可能性
- Node.js 18.19.1以上にアップグレード

### CSV Parse Error

- パース不能な不正行は件数がUIバナーに表示される
- CSV全体の読み込みに失敗した場合は `SAMPLE_DATA` にフォールバック
- `npm run validate-csv` でローカル検査できる
- 開発ビルドではDevToolsコンソールの `[CSV_LOAD]` ログを確認

### Browser Cache Issues

デプロイ後に変更が反映されない場合:
- ハードリロード: Ctrl+Shift+R (Windows) / Cmd+Shift+R (Mac)
- シークレットウィンドウで開く
- ブラウザキャッシュをクリア

## Known Remaining Tasks

- **例文がテンプレート生成のままの動画が7本**あり、実発話への差し替え作業中（オーナー作業）
- **Service Worker / PWA完全化（オフライン対応）は Phase 2**
- 苦手検出（`lapses` の活用）も Phase 2 候補（正典参照）

---

**Version**: 3.0.0
**Last Updated**: 2026-08-27

変更履歴は [CHANGELOG.md](CHANGELOG.md) を参照。
