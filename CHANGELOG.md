# Changelog

All notable changes to Vlingual Cards will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
**デモ**: https://w-udagawa.github.io/vlingual-cards/
