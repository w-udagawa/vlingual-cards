// 学習ファネルの最小イベント計測（Vercel Web Analytics カスタムイベント）。
//
// 前提（docs/analytics.md 参照）:
// - Hobbyプランでは track() を呼んでも記録されない（Proの Events パネルにのみ出る）。
//   プラン不明でも安全に動くよう、失敗しても画面には一切影響させない。
// - Pro のカスタムイベントは1イベントにつきプロパティ最大2個（Plus拡張で8個）。
//   ここでは常に2個以下に丸める。
// - 値は string/number/boolean/null のみ（ネストしたオブジェクトは送らない）。
//
// 呼び出し側（App.tsx）は自由入力・単語ごとの進捗・インポートJSONを一切渡さないこと。
import { track } from '@vercel/analytics';

type AllowedValue = string | number | boolean | null;

const MAX_PROPS = 2;
const GUARD_PREFIX = 'vlc_evt_';

// deck_open / study_start / study_complete / review_start は「同じデッキ・同じセッションでの
// 二重送信」を防ぐため、セッション（sessionStorage）単位で一度だけ送る。
// React の再描画・StrictModeの二重effect・同一タブでのリロードをまたいでガードが効く。
const GUARDED_EVENTS = new Set(['deck_open', 'study_start', 'study_complete', 'review_start']);

function isDisabled(): boolean {
  try {
    return import.meta.env.VITE_ANALYTICS_EVENTS === 'off';
  } catch {
    return false;
  }
}

function isPrimitive(value: unknown): value is AllowedValue {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}

// 3個目以降のプロパティ・非プリミティブ値は静かに落とす（Proの上限2個を超えない）
function sanitizeProps(
  props?: Record<string, unknown>
): Record<string, AllowedValue> | undefined {
  if (!props) return undefined;
  const safeEntries = Object.entries(props).filter(([, value]) => isPrimitive(value));
  if (safeEntries.length === 0) return undefined;
  return Object.fromEntries(safeEntries.slice(0, MAX_PROPS)) as Record<string, AllowedValue>;
}

// ガードキー: イベント名 + 最初のプロパティの値（例: video_id）。
// entry_source/session_mode 等の付随属性が変わっても「同じデッキ」への
// 呼び出しとして扱えるよう、2個目以降の値はキーに含めない。呼び出し側は
// 識別子（video_id 等）を必ず最初のプロパティに置くこと。
function guardKey(name: string, props?: Record<string, AllowedValue>): string {
  const values = props ? Object.values(props) : [];
  const identity = values.length > 0 ? String(values[0]) : '';
  return `${GUARD_PREFIX}${name}:${identity}`;
}

function hasFired(key: string): boolean {
  try {
    return sessionStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function markFired(key: string): void {
  try {
    sessionStorage.setItem(key, '1');
  } catch {
    // 保存できなくても計測を諦めるだけで、画面には影響させない
  }
}

/**
 * カスタムイベントを送る。無効化されていても、track が使えなくても、
 * track が例外を投げても、呼び出し元には一切影響しない（常にvoidで戻る）。
 */
export function trackEvent(name: string, props?: Record<string, unknown>): void {
  if (isDisabled()) return;
  if (typeof track !== 'function') return;

  const safeProps = sanitizeProps(props);

  if (GUARDED_EVENTS.has(name)) {
    const key = guardKey(name, safeProps);
    if (hasFired(key)) return;
    markFired(key);
  }

  try {
    track(name, safeProps);
  } catch {
    // Vercel Analytics 側のエラーで学習体験を止めない
  }
}

/** テスト用: セッションガードを全て消す（本番コードからは呼ばない） */
export function resetEventGuards(): void {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith(GUARD_PREFIX)) keysToRemove.push(key);
    }
    keysToRemove.forEach((key) => sessionStorage.removeItem(key));
  } catch {
    // no-op
  }
}
