# Changelog

All notable changes to Vlingual Cards will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.0.0] - 2026-08-27

### Added
- **ハイブリッド学習モデル**: 進捗をブラウザ（localStorage キー `vlc_learning_v1`）に永続保存
  - 裏側はLeitner 5箱の間隔反復。UIにはSRS用語を出さない（正典: `docs/learning-model.md`）
  - ユーザー向け説明は「🔴すぐまた出る / 🟡しばらくしてまた出る / 🟢余裕=当分出ない」+「記録が進むのは1日1回」のみ
  - 前に学んだ単語は、忘れかけた頃に「今日の復習」に出てくる
- **1セット = 最大20枚**: 大きい動画は自動的に複数セットに分かれる（セット番号は見せない）
  - 評価後のセット内再出題: 覚えてない→3枚後 / だいたいOK→8枚後 / 余裕→出ない
- **今日の復習**: ホーム（キャスト一覧）に「🔁 今日の復習（N枚）」導線
  - 全動画横断・due到来カードのみ・上限30枚・新規なし
- **セッション復帰**: リロード/アプリ切替でも同日・同スコープなら続きから復帰
- **「覚えた」チェックと学習進捗の完全統合**: 語彙一覧のチェック = 出題停止スイッチ
  - 「余裕」を積み上げたカードは自動でチェックが付く。外すと再出題
- **学習データの引っ越し**: ヘルプモーダルから進捗のエクスポート/インポート（JSONコピペ）
- **カード裏面に🔊リプレイボタン**: 音声OFF設定でも単発再生可
- **ディープリンク**: `https://vlingual-cards.vercel.app/?video=<YouTube動画ID>` で動画の学習画面に直行（概要欄・固定コメントに貼れる）。`?cast=<キャスト名>` も動作。戻るボタンは常に表示
- **テスト・CI**: `npm test`（vitest 62テスト）/ `npm run validate-csv`（CSV品質チェック）/ GitHub Actionsでpush時に非ブロッキング警告
- **Vercel Analytics**（Cookieレス）
- 品詞「スラング」を正式サポート

### Changed
- **完了画面**: 🎉 +「明日はN枚が復習に来ます」+ 主ボタン「▶ この動画をもう一度見る」+「次のセットへ」。`confirm()` ダイアログと「進捗リセット」ボタンを廃止
- **CSVパーサ刷新**: RFC4180準拠 + ヘッダー名ベース。6/7/9列後方互換、未知の追加列にも耐える。不正行は無言スキップせずUIバナーに件数表示。同一動画内の重複行は自動で1枚に統合
- **PWAインストールバナー**: インストール済み（standalone表示）なら出ない
- **アーキテクチャ**: App.tsx（UI集約）+ `src/lib/` の純関数（csv.ts / ids.ts / schedule.ts / session.ts / store.ts）+ `src/lib/__tests__/`

### Fixed（データ修正）
- 列ズレで消えていた4語を復旧（girl-failuring, aura farming, sub (subtitle), absorb）
- 同一動画内の重複17組を削除、`?si=` トラッキングパラメータ除去、動画タイトルの揺れを統一 → 現在672カード

### Unchanged
- Service Workerは未実装 → **オフラインは非対応（Phase 2予定）**
- アカウント不要・無料・広告なし。Node 18 / Vite 5 / React 18

> (未記録: v2.0.0 セッション制学習・3階層ナビ・ライトモード・語彙一覧等)

## [1.3.1] - 2025-10-25

### Added
- **チャンネルロゴ表示**: アプリヘッダーにチャンネルロゴを追加
  - `public/channel-logo.jpg` を配置
  - ヘッダーの "VL" テキストロゴを画像に置き換え

### Changed
- **PWAアイコン**: SVG形式からチャンネルロゴJPG形式に変更
  - `public/icons/icon-192.jpg` (192×192px)
  - `public/icons/icon-512.jpg` (512×512px)
  - ホーム画面に追加時、チャンネルロゴが表示されます

### Technical
- `public/manifest.json`: icons の type を `image/svg+xml` → `image/jpeg` に変更
- `src/App.tsx`: `<div className="logo">VL</div>` → `<img src="/channel-logo.jpg">` に変更（2箇所）
- `src/App.css`: `.logo` スタイルを画像表示用に最適化（`object-fit: contain`, `width: auto`）

## [1.2.0] - 2025-10-21

### Added
- **複数動画対応**: ギャラリー形式の動画選択画面
  - YouTubeサムネイル自動表示（API不要）
  - 動画ごとの語彙数表示
  - 「全ての動画」オプション（すべての語彙を一括学習）
- **動画ごとの進捗管理**: 各動画の学習状況を個別に保存
  - localStorage キー: `vocab_progress_${videoId}`
  - 動画切り替え時に自動的に進捗をロード
- **レスポンシブギャラリーUI**: スマホ・タブレット・PC対応
  - デスクトップ: グリッド表示（3-4列）
  - タブレット: グリッド表示（2-3列）
  - スマホ: 1列表示
- **戻るボタン**: 学習画面からギャラリーに戻る機能（複数動画がある場合のみ表示）
- **HOW_TO_USE.md**: 日本語の詳細な使い方ガイド
  - 基本操作、評価ボタンの使い方
  - スマートスケジューリングの説明
  - よくある質問（FAQ）

### Changed
- **進捗保存ロジック**: 動画ごとの進捗とグローバル進捗の両方をサポート
- **ヘッダー表示**: 選択中の動画タイトルを表示
- **初期画面**: 複数動画がある場合はギャラリー、1動画のみの場合は学習画面に直接遷移

### Technical
- `types.ts`: `VideoGroup` 型定義追加
- `App.tsx`: YouTube ID抽出関数、グループ化ロジック、2画面アーキテクチャ
- `App.css`: ギャラリーUI用スタイル（~150行追加）
- `CLAUDE.md`: v1.2.0の技術詳細を追加

### Tested
- ✅ ギャラリー画面: 2つの動画サムネイル + 「全ての動画」カード表示確認
- ✅ 動画1選択: 15語の語彙、正しい動画URL（d3CIJ1BiBvQ）
- ✅ 動画2選択: 14語の語彙、正しい動画URL（-o_vi536bpA）
- ✅ 全ての動画: 29語すべて学習可能
- ✅ 戻るボタン: 各画面からギャラリーへの遷移確認
- ✅ 構造化ログ: `videoCount: 2` 確認
- ✅ YouTubeサムネイル: 異なる動画の画像が正しく表示

## [1.1.0] - 2025-10-21

### Added
- **GitHub連携CSV**: GitHub Raw URLから直接CSV読み込み
  - CSV編集→即反映（再デプロイ不要）
  - `DEFAULT_CSV_URL` 定数で管理
- **構造化ログ**: デバッグ用の詳細ログ（vibelogger風）
  - `[CSV_LOAD]`: CSV読み込み状況
  - `[CARD_SELECT]`: カード選択戦略
  - `[CARD_RATE]`: 評価履歴と進捗変化
- **videoCount ログ**: CSV読み込み時に動画数を記録

### Changed
- CSVデータソース: ローカルファイル → GitHub Raw URL
- エラーハンドリング: フォールバックとしてサンプルデータを使用

### Technical
- `types.ts`: `DEFAULT_CSV_URL` 定数追加
- `App.tsx`: 構造化ログ実装

## [1.0.0] - 2025-10-20

### Added
- **基本的なフラッシュカード機能**
  - 3Dフリップアニメーション
  - タップで表裏を切り替え
- **スマートスケジューリング**
  - 未学習カード優先
  - スコア順復習（苦手カードを優先的に復習）
  - スコア計算式: `seen × 1 + again × 3 - easy`
- **3段階評価システム**
  - 覚えてない（Again）: +4スコア
  - だいたいOK（OK）: +2スコア
  - 余裕（Easy）: +0スコア
- **音声読み上げ機能**
  - Web Speech API使用
  - 英語（en-US）、0.9倍速
  - トグルボタンでON/OFF切り替え
- **進捗保存機能**
  - localStorage使用
  - 単語ごとの学習履歴を保存
  - 進捗リセット機能
- **レスポンシブデザイン**
  - スマホ・タブレット・PC対応
  - カスタムCSS（CSS Variables使用）
- **PWA対応**
  - manifest.json実装
  - ホーム画面に追加可能
- **CSV解析機能**
  - カンマ区切りCSVをパース
  - エスケープされたクォート対応
  - 難易度バッジ（初級/中級/上級）

### Technical
- **フレームワーク**: React 18 + TypeScript 5
- **ビルドツール**: Vite 5.4.21
- **スタイリング**: カスタムCSS
- **デプロイ**: GitHub Pages（gh-pages）
- **Node.js互換性**: Node.js 18以上

---

**リポジトリ**: https://github.com/w-udagawa/vlingual-cards
**デモ**: https://vlingual-cards.vercel.app
