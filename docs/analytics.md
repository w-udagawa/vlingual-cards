# 学習ファネルの計測イベント

**この文書が学習ファネルのイベント仕様の正典。** 実装は
[src/lib/analytics.ts](../src/lib/analytics.ts)（送信の共通ラッパー）と
[src/App.tsx](../src/App.tsx)（発火箇所）。

背景・設計判断の元になった監査は
[vtuber-learning-clipper/docs/vlingual-system-audit-2026-09-06.md](../../vtuber-learning-clipper/docs/vlingual-system-audit-2026-09-06.md)
の P1-B（「動画から学習・復習への転換が測れない」）を参照。

## 送信先とプラン制約

- **Vercel Web Analytics** のカスタムイベント（`@vercel/analytics` の `track()`）を使う。
- **Hobbyプランでは記録されない**。`track()` 自体はエラーにならず呼べるが、
  Vercel側のEventsパネルには何も出ない。**Pro（$20/月〜）にすると同じコードのまま
  Events パネルに集計が出る**。オーナーの契約プランは本実装時点で未確認のため、
  コードはどちらのプランでも安全（Hobbyでは単に何も起きない）に作ってある。
- Pro のカスタムイベントは**1イベントにつきプロパティ最大2個**（Plus拡張で8個）。
  値は `string` / `number` / `boolean` / `null` のみ、ネストしたオブジェクトは不可。
  → `trackEvent()` が3個目以降のプロパティと非プリミティブな値を自動で落とす。

## イベント一覧

| イベント | 発火条件 | プロパティ（≤2個） | ガード |
|---|---|---|---|
| `deck_open` | 有効な動画デッキ（`showVideo`）を表示したとき | `video_id`, `entry_source`（`"link"` = `?video=`直リンク経由 / `"app"` = 動画一覧からのクリック） | 同一 `video_id` はセッション中1回のみ |
| `study_start` | そのスコープ（動画/キャスト全体/全動画/復習）での最初の評価ボタン押下 | `video_id`（動画スコープのみ。それ以外は`null`）, `session_mode`（`"video"` \| `"review"`） | 同一 `video_id` はセッション中1回のみ |
| `study_complete` | 評価によりキューが空になった（そのセットをやり切った）瞬間 | `video_id`, `session_mode` | 同一 `video_id` はセッション中1回のみ |
| `review_start` | 「今日の復習」スコープでの最初の評価ボタン押下 | `session_mode`（常に`"review"`） | セッション中1回のみ |
| `video_return` | 元動画へのリンクをクリックしたとき | `video_id`, `placement`（`"card"` = カード裏面のリンク / `"complete"` = セット完了画面の「もう一度見る」） | ガードなし（毎回送る） |

`study_complete` の `initial_size`（監査文書の提案）はプロパティ2個制限のため送らない。

**送らないもの**: 自由入力テキスト、単語ごとの詳細進捗（カードID・評価内容）、
進捗エクスポート/インポートのJSON。

## ガード（二重送信防止）

`src/lib/analytics.ts` の `trackEvent()` が、`deck_open` / `study_start` /
`study_complete` / `review_start` について「イベント名 + 1個目のプロパティ値
（`video_id` など）」をキーに `sessionStorage` へ一度だけ記録し、以後の同一キー
呼び出しは静かに無視する。これにより:

- Reactの再描画、StrictModeの二重effect実行、同一タブでのリロードをまたいでも
  同じデッキのイベントが二重送信されない。
- 2個目以降のプロパティ（`entry_source` / `session_mode`）が呼び出しごとに違っても、
  同じ `video_id` である限り「同じデッキ」として1回にまとめる。
- `video_return` はガード対象外（ユーザーが動画へ戻るたびに送りたいため）。
- タブを閉じる（`sessionStorage`が消える）か新しいタブで開けば、また1回だけ送れる。

**既知の制約**: `study_start` / `study_complete` の `video_id` は動画スコープ以外
（キャスト全体・全動画・復習）では `null` になり、ガードのキーもこの3スコープ間で
衝突しうる（例: 「全動画」学習の直後に「復習」を始めても`study_start`が送られない
ことがある）。主要なファネルは動画単位（`deck_open → study_start → study_complete`）
なので実害は小さいと判断し、対応は見送っている。`review_start` はこの衝突の影響を
受けない独立したガードキーを持つため、復習開始の計測自体は常に正しく行われる。

## 動作確認方法

- `VITE_ANALYTICS_EVENTS=off` を `.env`（または環境変数）に設定すると、
  全イベント送信が無効になる（`trackEvent()` が即座に何もせず戻る）。
- テストは `src/lib/__tests__/analytics.test.ts`（`npm test`）。
  `@vercel/analytics` の `track` をモックし、プロパティの丸め・無効化・
  例外の握りつぶし・ガードの動作を検証する。
- 本番での確認は Vercel ダッシュボード → プロジェクト → Analytics → Events
  （**Proプラン以上でのみ表示される**）。
