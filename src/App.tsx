import { useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import type { VocabCard, VideoGroup, CastGroup } from './types';
import {
  SAMPLE_DATA,
  DEFAULT_CSV_URL,
  AUDIO_ENABLED_KEY,
  THEME_PREFERENCE_KEY,
  AGENCY_ORDER_KEY,
  INSTALL_BANNER_DISMISSED_KEY
} from './types';
import { parseVocabCsv, attachCardIds } from './lib/csv';
import type { CardProgress, Rating } from './lib/schedule';
import {
  applyRating,
  isMastered,
  setMasteredManually,
  setUnlearnedManually,
  todayLocal
} from './lib/schedule';
import type { ActiveSession, LearningStore } from './lib/store';
import {
  emptyStore,
  loadStore,
  saveStore,
  migrateLegacyChecked,
  exportProgress,
  importProgress
} from './lib/store';
import {
  buildStudySet,
  buildReviewSet,
  reinsert,
  sanitizeQueue,
  availableSetSize,
  countDue,
  countMastered,
  SET_SIZE,
  REVIEW_LIMIT
} from './lib/session';

// 開発時のみの構造化ログ（本番ビルドには出さない）
const devLog = (...args: unknown[]) => {
  if (import.meta.env.DEV) console.log(...args);
};

// サムネイルURL生成（APIキー不要のYouTube CDN直参照）
function getThumbnailUrl(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
}

// 難易度に応じた色を取得
function getLevelColor(level: string): string {
  switch (level) {
    case '初級': return 'var(--level-beginner)';
    case '中級': return 'var(--level-intermediate)';
    case '上級': return 'var(--level-advanced)';
    default: return '#888';
  }
}

// 動画ごとにカードをグループ化（動画タイトルはvideoId初出行を正とする）
function groupCardsByVideo(cards: VocabCard[]): VideoGroup[] {
  const grouped = new Map<string, VideoGroup>();

  cards.forEach(card => {
    if (!grouped.has(card.videoId)) {
      grouped.set(card.videoId, {
        id: card.videoId,
        title: card.動画タイトル || `動画${grouped.size + 1}`,
        url: card.動画URL,
        thumbnailUrl: getThumbnailUrl(card.videoId),
        cards: [],
        wordCount: 0
      });
    }
    const group = grouped.get(card.videoId)!;
    group.cards.push(card);
    group.wordCount++;
  });

  return Array.from(grouped.values());
}

// キャスト名をURL用スラッグに変換
function createCastSlug(castName: string): string {
  return encodeURIComponent(castName);
}

// キャストごとにカードをグループ化
function groupCardsByCast(cards: VocabCard[]): CastGroup[] {
  const videoGroups = groupCardsByVideo(cards);
  const castMap = new Map<string, CastGroup>();

  videoGroups.forEach(videoGroup => {
    const firstCard = videoGroup.cards[0];
    const castName = firstCard?.キャスト名 || '未分類';
    const agency = firstCard?.事務所;
    const castId = createCastSlug(castName);

    if (!castMap.has(castId)) {
      castMap.set(castId, {
        id: castId,
        name: castName,
        agency: agency,
        videos: [],
        wordCount: 0,
        thumbnailUrl: videoGroup.thumbnailUrl
      });
    }

    const castGroup = castMap.get(castId)!;
    castGroup.videos.push(videoGroup);
    castGroup.wordCount += videoGroup.wordCount;
  });

  return Array.from(castMap.values()).sort((a, b) => {
    const agencyA = a.agency || 'ZZZZ未分類';
    const agencyB = b.agency || 'ZZZZ未分類';
    return agencyA.localeCompare(agencyB, 'ja');
  });
}

// 音声読み上げ（設定に関係なく単発で鳴らす）
function speakNow(word: string) {
  if (!('speechSynthesis' in window)) return;
  const utterance = new SpeechSynthesisUtterance(word);
  utterance.lang = 'en-US';
  utterance.rate = 0.9;
  speechSynthesis.speak(utterance);
}

// テーマトグルアイコン（抽象的な半円デザイン）
function ThemeToggleIcon({ theme }: { theme: 'dark' | 'light' }) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="theme-toggle-icon"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" fill="none" />
      <path
        d={theme === 'dark'
          ? "M12 3 A9 9 0 0 1 12 21 Z"  // 左半分塗りつぶし（夜）
          : "M12 3 A9 9 0 0 0 12 21 Z"  // 右半分塗りつぶし（昼）
        }
        fill="currentColor"
      />
    </svg>
  );
}

// 音声アイコン（スピーカーSVG）
function AudioIcon({ enabled }: { enabled: boolean }) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="audio-icon"
    >
      <path
        d="M11 5L6 9H2v6h4l5 4V5z"
        stroke="currentColor"
        strokeWidth="2"
        fill="currentColor"
        strokeLinejoin="round"
      />
      {enabled ? (
        <>
          <path
            d="M15.5 8.5c.7.7 1.5 1.6 1.5 3.5s-.8 2.8-1.5 3.5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M18 6c1.2 1.2 2 2.8 2 6s-.8 4.8-2 6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </>
      ) : (
        <path d="M3 3L21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      )}
    </svg>
  );
}

// 語彙一覧モーダル（チェック = mastered の手動スイッチ）
function VocabListModal({
  title,
  cards,
  progress,
  filter,
  onFilterChange,
  onToggle,
  onClose
}: {
  title: string;
  cards: VocabCard[];
  progress: Record<string, CardProgress>;
  filter: 'all' | 'unchecked' | 'checked';
  onFilterChange: (f: 'all' | 'unchecked' | 'checked') => void;
  onToggle: (card: VocabCard) => void;
  onClose: () => void;
}) {
  // ESCキーでモーダルを閉じる
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const isChecked = (card: VocabCard) => isMastered(progress[card.id]);
  const checkedCount = countMastered(cards, progress);

  const filteredCards = cards.filter(card => {
    if (filter === 'checked') return isChecked(card);
    if (filter === 'unchecked') return !isChecked(card);
    return true;
  });

  return (
    <div className="vocab-list-modal-overlay" onClick={onClose}>
      <div className="vocab-list-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="vocab-list-header">
          <h2>📋 {title}</h2>
          <button className="vocab-list-close" onClick={onClose}>×</button>
        </div>

        <div className="vocab-filter-buttons">
          <button
            className={`vocab-filter-btn ${filter === 'all' ? 'active' : ''}`}
            onClick={() => onFilterChange('all')}
          >
            全て ({cards.length})
          </button>
          <button
            className={`vocab-filter-btn ${filter === 'unchecked' ? 'active' : ''}`}
            onClick={() => onFilterChange('unchecked')}
          >
            学習中 ({cards.length - checkedCount})
          </button>
          <button
            className={`vocab-filter-btn ${filter === 'checked' ? 'active' : ''}`}
            onClick={() => onFilterChange('checked')}
          >
            覚えた ({checkedCount})
          </button>
        </div>

        <div className="vocab-list-table-wrapper">
          <table className="vocab-list-table">
            <thead>
              <tr>
                <th className="vocab-checkbox-col">覚えた</th>
                <th>単語</th>
                <th>和訳</th>
              </tr>
            </thead>
            <tbody>
              {filteredCards.length === 0 ? (
                <tr>
                  <td colSpan={3} className="vocab-empty">該当する単語はありません</td>
                </tr>
              ) : (
                filteredCards.map(card => {
                  const checked = isChecked(card);
                  return (
                    <tr key={card.id} className={checked ? 'vocab-checked' : ''}>
                      <td className="vocab-checkbox-col">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => onToggle(card)}
                          className="vocab-checkbox"
                        />
                      </td>
                      <td className="vocab-word">{card.単語}</td>
                      <td className="vocab-translation">{card.和訳}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ヘルプモーダル（全画面共通・実装と一致する説明のみ）
function HelpModal({
  onClose,
  buildExport,
  doImport
}: {
  onClose: () => void;
  buildExport: () => string;
  doImport: (text: string) => boolean;
}) {
  const [exportText, setExportText] = useState('');
  const [importText, setImportText] = useState('');
  const [dataMessage, setDataMessage] = useState('');

  const handleShowExport = () => {
    setExportText(buildExport());
    setDataMessage('');
  };

  const handleCopyExport = async () => {
    try {
      await navigator.clipboard.writeText(exportText);
      setDataMessage('コピーしました');
    } catch {
      setDataMessage('コピーできませんでした。テキストを選択して手動でコピーしてください');
    }
  };

  const handleImport = () => {
    if (!importText.trim()) return;
    if (doImport(importText)) {
      setDataMessage('取り込みました！進捗が反映されています');
      setImportText('');
    } else {
      setDataMessage('取り込めませんでした。テキストが正しいか確認してください');
    }
  };

  return (
    <div className="help-modal-overlay" onClick={onClose}>
      <div className="help-modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="help-modal-close" onClick={onClose}>×</button>
        <h2>📖 使い方</h2>

        <section className="help-section">
          <h3>🎯 基本的な使い方</h3>
          <ol>
            <li><strong>キャスト・動画を選択</strong>: 推しのキャスト → 学習したい動画をタップ</li>
            <li><strong>カードをタップ</strong>: 表面（英単語）をめくって裏面（和訳と実際の発話）を確認</li>
            <li><strong>3段階で評価</strong>:
              <ul>
                <li>🔴 <strong>覚えてない</strong>: すぐまた出てきます</li>
                <li>🟡 <strong>だいたいOK</strong>: しばらくしてまた出てきます</li>
                <li>🟢 <strong>余裕</strong>: 当分出てきません</li>
              </ul>
            </li>
          </ol>
          <p className="help-note">記録が進むのは1日1回。同じ日に何度評価しても、翌日以降の出方は変わりません。</p>
        </section>

        <section className="help-section">
          <h3>🔁 今日の復習</h3>
          <p>前に学んだ単語は、忘れかけた頃に自動でまた出てきます。ホーム画面に「今日の復習」が表示されたら、サッと片付けましょう（数分で終わります）。</p>
        </section>

        <section className="help-section">
          <h3>📋 語彙一覧と「覚えた」チェック</h3>
          <p>一覧で「覚えた」にチェックすると、その単語は出題されなくなります。学習で「余裕」を積み重ねた単語にも自動でチェックが付きます。チェックを外せばまた出題されます。</p>
        </section>

        <section className="help-section">
          <h3>💾 進捗の保存</h3>
          <ul>
            <li>✅ 進捗はこの端末のブラウザに自動保存されます</li>
            <li>⚠️ ブラウザのデータ削除で消えます。別の端末・ブラウザとは共有されません</li>
            <li>📲 ホーム画面に追加して使うと、進捗が消えにくくなります</li>
          </ul>
        </section>

        <section className="help-section">
          <h3>🎵 音声読み上げ</h3>
          <p>ヘッダーのスピーカーボタンでON/OFFできます。ONにするとカードをめくった時に発音が流れます。カード裏面の🔊でいつでも聞き直せます。</p>
        </section>

        <section className="help-section">
          <h3>📦 学習データの引っ越し</h3>
          <p>進捗を別の端末に移したり、バックアップできます。</p>
          <div className="data-transfer">
            <button className="btn-data" onClick={handleShowExport}>進捗を書き出す</button>
            {exportText && (
              <>
                <textarea className="data-textarea" readOnly value={exportText} rows={3} />
                <button className="btn-data" onClick={handleCopyExport}>コピー</button>
              </>
            )}
            <textarea
              className="data-textarea"
              placeholder="書き出したテキストをここに貼り付け"
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              rows={3}
            />
            <button className="btn-data" onClick={handleImport}>取り込む</button>
            {dataMessage && <p className="data-message">{dataMessage}</p>}
          </div>
        </section>

        <section className="help-section">
          <h3>📲 ホーム画面に追加</h3>
          <ul>
            <li><strong>iPhone/iPad</strong>: Safari で共有ボタン → 「ホーム画面に追加」</li>
            <li><strong>Android</strong>: Chrome のメニュー → 「ホーム画面に追加」</li>
          </ul>
        </section>

        <button className="help-modal-button" onClick={onClose}>閉じる</button>
      </div>
    </div>
  );
}

// PWAインストールバナー
function InstallBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="install-banner">
      <button className="install-banner-close" onClick={onDismiss}>×</button>
      <div className="install-banner-icon">📲</div>
      <div className="install-banner-content">
        <h3>ホーム画面に追加できます</h3>
        <p className="install-banner-subtitle">アプリのように使えて、学習の進捗も消えにくくなります</p>
        <div className="install-banner-steps">
          <div className="install-step">
            <strong>iPhone/iPad:</strong> Safari の共有ボタン → 「ホーム画面に追加」
          </div>
          <div className="install-step">
            <strong>Android:</strong> Chrome のメニュー → 「ホーム画面に追加」
          </div>
        </div>
        <button className="install-banner-button" onClick={onDismiss}>閉じる</button>
      </div>
    </div>
  );
}

type Screen = 'cast-list' | 'video-list' | 'study';
type VocabListSource = { title: string; cards: VocabCard[] };

// ActiveSessionの組み立てを1箇所に（キューが空ならセッションなし）
function makeSession(scopeId: string, day: number, queue: string[]): ActiveSession | null {
  return queue.length > 0 ? { scopeId, day, queue } : null;
}

function App() {
  // データ
  const [allCards, setAllCards] = useState<VocabCard[]>([]);
  const [csvWarnings, setCsvWarnings] = useState<string[]>([]);
  const [usingSample, setUsingSample] = useState(false);
  const allCasts = useMemo(() => groupCardsByCast(allCards), [allCards]);

  // ナビゲーション（allVideos は selectedCast から導出）
  const [screen, setScreen] = useState<Screen>('cast-list');
  const [selectedCast, setSelectedCast] = useState<CastGroup | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<VideoGroup | null>(null);
  const allVideos = selectedCast?.videos ?? [];

  // 学習セッション
  const [scopeId, setScopeId] = useState<string | null>(null);
  const [scopeCards, setScopeCards] = useState<VocabCard[]>([]);
  const [queue, setQueue] = useState<string[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const sessionDayRef = useRef(0); // 現セッションを組んだ日
  const rateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null); // 450msスライド用

  // 学習進捗（永続）
  const [progress, setProgress] = useState<Record<string, CardProgress>>({});
  const storeRef = useRef<LearningStore>(emptyStore());

  // UI状態
  const [loading, setLoading] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [showHelp, setShowHelp] = useState(false);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [vocabListSource, setVocabListSource] = useState<VocabListSource | null>(null);
  const [vocabListFilter, setVocabListFilter] = useState<'all' | 'unchecked' | 'checked'>('all');
  const [agencyOrder, setAgencyOrder] = useState<string[]>([]);
  const [showAgencyOrderModal, setShowAgencyOrderModal] = useState(false);
  const [tempOrder, setTempOrder] = useState<string[]>([]);

  const cardMap = useMemo(() => new Map(allCards.map(c => [c.id, c])), [allCards]);
  const currentCard = currentId ? cardMap.get(currentId) ?? null : null;
  const today = todayLocal();
  const dueTodayCount = useMemo(
    () => countDue(allCards, progress, today),
    [allCards, progress, today]
  );

  // 事務所グルーピングと表示順（キャスト一覧の描画・並び順モーダルで共用）
  const agenciesMap = useMemo(() => {
    const m = new Map<string, CastGroup[]>();
    allCasts.forEach(cast => {
      const name = cast.agency || '未分類';
      if (!m.has(name)) m.set(name, []);
      m.get(name)!.push(cast);
    });
    return m;
  }, [allCasts]);

  const sortedAgencyNames = useMemo(() => {
    const names = Array.from(agenciesMap.keys());
    return agencyOrder.length > 0
      ? [
          ...agencyOrder.filter(name => agenciesMap.has(name)),
          ...names.filter(name => !agencyOrder.includes(name)).sort((a, b) => a.localeCompare(b, 'ja'))
        ]
      : [...names].sort((a, b) => a.localeCompare(b, 'ja'));
  }, [agenciesMap, agencyOrder]);

  // 保留中のスライドタイマーを破棄（セッション切替・離脱時の取り違え防止）
  const cancelPendingRate = () => {
    if (rateTimerRef.current !== null) {
      clearTimeout(rateTimerRef.current);
      rateTimerRef.current = null;
    }
    setIsTransitioning(false);
  };

  // ストアへの書き込み（別タブの書き込みをマージしてから保存）
  const commitStore = (nextCards: Record<string, CardProgress>, nextSession: ActiveSession | null) => {
    const saved = saveStore({ ...storeRef.current, cards: nextCards, session: nextSession });
    storeRef.current = saved;
    setProgress(saved.cards);
  };

  // デッキ適用（CSV成功/サンプルフォールバック共通）
  // 注意: レガシー移行はサンプルデッキでは走らせない（実カードとID一致せず
  // migratedLegacy だけ立って移行が焼き切れるため）
  const applyDeck = (cards: VocabCard[], warnings: string[], sample: boolean) => {
    setAllCards(cards);
    setCsvWarnings(warnings);
    setUsingSample(sample);

    let store = loadStore();
    if (!sample) {
      const migrated = migrateLegacyChecked(store, cards, todayLocal());
      store = migrated === store ? store : saveStore(migrated);
    }
    storeRef.current = store;
    setProgress(store.cards);
  };

  // CSV読み込み
  const loadCSV = async () => {
    devLog('[CSV_LOAD]', { operation: 'loadCSV', url: DEFAULT_CSV_URL, status: 'start' });
    try {
      setLoading(true);
      const response = await fetch(DEFAULT_CSV_URL);
      if (!response.ok) {
        throw new Error('CSVの取得に失敗しました');
      }
      const text = await response.text();
      const { cards, warnings } = parseVocabCsv(text);
      applyDeck(cards, warnings, false);
      warnings.forEach(w => console.warn('[CSV_WARN]', w));
      devLog('[CSV_LOAD]', {
        operation: 'loadCSV',
        status: 'success',
        cardCount: cards.length,
        warningCount: warnings.length
      });
    } catch (err) {
      console.error('[CSV_LOAD]', {
        operation: 'loadCSV',
        status: 'error',
        error: err instanceof Error ? err.message : '不明なエラー',
        fallback: 'SAMPLE_DATA'
      });
      applyDeck(attachCardIds(SAMPLE_DATA), [], true);
    } finally {
      setLoading(false);
    }
  };

  // 設定読み込み
  const loadSettings = () => {
    const audioStored = localStorage.getItem(AUDIO_ENABLED_KEY);
    if (audioStored) setAudioEnabled(audioStored === 'true');

    const savedTheme = localStorage.getItem(THEME_PREFERENCE_KEY);
    if (savedTheme === 'light' || savedTheme === 'dark') {
      setTheme(savedTheme);
    } else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      setTheme(prefersDark ? 'dark' : 'light');
    }

    const savedOrder = localStorage.getItem(AGENCY_ORDER_KEY);
    if (savedOrder) {
      try {
        const parsed = JSON.parse(savedOrder);
        if (Array.isArray(parsed)) setAgencyOrder(parsed);
      } catch (e) {
        console.error('Failed to parse agency order:', e);
      }
    }
  };

  // 学習セッション開始（同日・同スコープの保存済みセッションがあればサニタイズして復帰）
  const enterStudy = (sid: string, cardsInScope: VocabCard[]) => {
    cancelPendingRate();
    const day = todayLocal();
    const saved = storeRef.current.session;
    const scopeIds = new Set(cardsInScope.map(c => c.id));

    let q: string[] = [];
    if (saved && saved.scopeId === sid && saved.day === day) {
      // masteredになったカード・スコープ外・デッキから消えたカードを除外して復帰
      q = sanitizeQueue(saved.queue, scopeIds, storeRef.current.cards);
    }
    if (q.length === 0) {
      const built = sid === 'review'
        ? buildReviewSet(allCards, storeRef.current.cards, day)
        : buildStudySet(cardsInScope, storeRef.current.cards, day);
      q = built.queue;
    }

    sessionDayRef.current = day;
    setScopeId(sid);
    setScopeCards(cardsInScope);
    setQueue(q);
    setCurrentId(q[0] ?? null);
    setIsFlipped(false);
    setScreen('study');

    commitStore(storeRef.current.cards, makeSession(sid, day, q));
  };

  // 評価処理（Leitner + 再挿入キュー）
  const handleRate = (type: Rating) => {
    if (!currentId || isTransitioning || !scopeId) return;

    const day = todayLocal();
    const prev = storeRef.current.cards[currentId];
    const nextProgress = { ...storeRef.current.cards, [currentId]: applyRating(prev, type, day) };
    const rest = queue.slice(1);
    const nextQueue = reinsert(rest, currentId, type);

    devLog('[CARD_RATE]', {
      operation: 'handleRate',
      cardId: currentId,
      rating: type,
      box: nextProgress[currentId].box,
      state: nextProgress[currentId].state,
      remaining: nextQueue.length
    });

    setQueue(nextQueue);
    commitStore(nextProgress, makeSession(scopeId, sessionDayRef.current, nextQueue));

    // スライドアニメーション（400ms + 50msバッファ）
    setIsTransitioning(true);
    setIsFlipped(false);
    rateTimerRef.current = setTimeout(() => {
      rateTimerRef.current = null;
      setCurrentId(nextQueue[0] ?? null);
      setIsTransitioning(false);
    }, 450);
  };

  // カードフリップ
  const handleFlip = () => {
    if (!isFlipped && currentCard && audioEnabled) {
      speakNow(currentCard.単語);
    }
    setIsFlipped(!isFlipped);
  };

  // 音声トグル
  const toggleAudio = () => {
    const newValue = !audioEnabled;
    setAudioEnabled(newValue);
    localStorage.setItem(AUDIO_ENABLED_KEY, String(newValue));
  };

  // テーマトグル
  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    localStorage.setItem(THEME_PREFERENCE_KEY, newTheme);
  };

  // ナビゲーション（show* はURLを更新しない。handle* はURL更新も行う）
  const showCastList = () => {
    cancelPendingRate();
    setScreen('cast-list');
    setSelectedCast(null);
    setSelectedVideo(null);
    setScopeId(null);
    setCurrentId(null);
    setIsFlipped(false);
  };

  const showCast = (cast: CastGroup) => {
    setSelectedCast(cast);
    setSelectedVideo(null);
    setScreen('video-list');
  };

  const showVideo = (video: VideoGroup) => {
    // 戻る導線のためにキャストを逆引きして常にセットする（?video= 直リンク対応）
    const cast = allCasts.find(c => c.videos.some(v => v.id === video.id)) ?? null;
    if (cast) setSelectedCast(cast);
    setSelectedVideo(video);
    enterStudy(`video:${video.id}`, video.cards);
  };

  const handleSelectCast = (cast: CastGroup) => {
    showCast(cast);
    window.history.pushState({}, '', `?cast=${cast.id}`);
  };

  const handleSelectVideo = (video: VideoGroup) => {
    showVideo(video);
    window.history.pushState({}, '', `?video=${video.id}`);
  };

  const handleSelectAllCasts = () => {
    setSelectedCast(null);
    setSelectedVideo(null);
    enterStudy('all', allCards);
    window.history.replaceState({}, '', window.location.pathname);
  };

  const handleSelectAllVideos = () => {
    if (!selectedCast) return;
    setSelectedVideo(null);
    enterStudy(`cast:${selectedCast.name}`, allVideos.flatMap(v => v.cards));
  };

  const handleStartReview = () => {
    setSelectedCast(null);
    setSelectedVideo(null);
    enterStudy('review', allCards);
    window.history.replaceState({}, '', window.location.pathname);
  };

  // 「戻る」系は履歴を積まない（replaceState。ブラウザ戻ると喧嘩しないため）
  const handleBackToCastList = () => {
    showCastList();
    window.history.replaceState({}, '', window.location.pathname);
  };

  const handleBackToVideoList = () => {
    cancelPendingRate();
    setScreen('video-list');
    setSelectedVideo(null);
    setScopeId(null);
    setCurrentId(null);
    setIsFlipped(false);
    if (selectedCast) {
      window.history.replaceState({}, '', `?cast=${selectedCast.id}`);
    }
  };

  // 学習画面からの戻り先
  const handleBackFromStudy = () => {
    if (selectedCast) {
      handleBackToVideoList();
    } else {
      handleBackToCastList();
    }
  };

  // インストールバナーを閉じる
  const handleDismissInstallBanner = () => {
    setShowInstallBanner(false);
    localStorage.setItem(INSTALL_BANNER_DISMISSED_KEY, 'true');
  };

  // 語彙一覧
  const openVocabList = (title: string, cards: VocabCard[]) => {
    setVocabListSource({ title, cards });
    setVocabListFilter('all');
  };

  const handleOpenVocabListFromGallery = (video: VideoGroup, e: React.MouseEvent) => {
    e.stopPropagation();
    openVocabList(video.title, video.cards);
  };

  const handleOpenVocabListFromStudy = () => {
    if (scopeId === 'review') {
      // 復習セッションでは「今日のキューに残っているカード」だけを見せる
      const cards = queue
        .map(id => cardMap.get(id))
        .filter((c): c is VocabCard => c !== undefined);
      openVocabList('今日の復習', cards);
    } else {
      openVocabList(selectedVideo ? selectedVideo.title : '語彙一覧', scopeCards);
    }
  };

  const handleCloseVocabList = () => {
    setVocabListSource(null);
  };

  // 「覚えた」チェック = mastered の手動スイッチ
  const toggleVocabCheck = (card: VocabCard) => {
    const day = todayLocal();
    const prev = storeRef.current.cards[card.id];
    const next = isMastered(prev) ? setUnlearnedManually(prev, day) : setMasteredManually(prev, day);
    const nextCards = { ...storeRef.current.cards, [card.id]: next };

    let session = storeRef.current.session;

    if (next.state === 'mastered') {
      // ライブのキューからも即時除外
      if (screen === 'study' && queue.includes(card.id)) {
        const nextQueue = queue.filter(id => id !== card.id);
        setQueue(nextQueue);
        if (currentId === card.id || rateTimerRef.current !== null) {
          // 表示中カード or 保留タイマーの対象が変わるため、即座に付け替える
          cancelPendingRate();
          setCurrentId(nextQueue[0] ?? null);
          setIsFlipped(false);
        }
        if (scopeId) session = makeSession(scopeId, sessionDayRef.current, nextQueue);
      } else if (session && session.queue.includes(card.id)) {
        // 学習画面の外からでも、保存済みセッションのキューには反映する
        session = makeSession(session.scopeId, session.day, session.queue.filter(id => id !== card.id));
      }
    }

    commitStore(nextCards, session);
  };

  // 進捗エクスポート/インポート
  const buildExport = () => exportProgress(storeRef.current);
  const doImport = (text: string): boolean => {
    const imported = importProgress(storeRef.current, text);
    if (!imported) return false;

    let session = imported.session;
    if (screen === 'study' && scopeId) {
      // インポートでmasteredになったカードをライブのキューからも外す
      const scopeIds = new Set(scopeCards.map(c => c.id));
      const nextQueue = sanitizeQueue(queue, scopeIds, imported.cards);
      if (nextQueue.length !== queue.length) {
        setQueue(nextQueue);
        if (currentId && !nextQueue.includes(currentId) && rateTimerRef.current === null && isMastered(imported.cards[currentId])) {
          setCurrentId(nextQueue[0] ?? null);
          setIsFlipped(false);
        }
      }
      session = makeSession(scopeId, sessionDayRef.current, nextQueue);
    } else if (session) {
      session = makeSession(
        session.scopeId,
        session.day,
        session.queue.filter(id => !isMastered(imported.cards[id]))
      );
    }

    storeRef.current = saveStore({ ...imported, session });
    setProgress(storeRef.current.cards);
    return true;
  };

  // 事務所並び順
  const saveAgencyOrder = (order: string[]) => {
    setAgencyOrder(order);
    localStorage.setItem(AGENCY_ORDER_KEY, JSON.stringify(order));
  };

  const moveAgencyUp = (index: number) => {
    if (index === 0) return;
    const newOrder = [...tempOrder];
    [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
    setTempOrder(newOrder);
  };

  const moveAgencyDown = (index: number) => {
    if (index === tempOrder.length - 1) return;
    const newOrder = [...tempOrder];
    [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
    setTempOrder(newOrder);
  };

  const handleSaveAgencyOrder = () => {
    saveAgencyOrder(tempOrder);
    setShowAgencyOrderModal(false);
  };

  // テーマ適用（data-theme属性）
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // 初期化
  useEffect(() => {
    loadSettings();
    loadCSV();

    // PWAインストールバナー（初回のみ・すでにインストール済みなら出さない）
    const dismissed = localStorage.getItem(INSTALL_BANNER_DISMISSED_KEY);
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (!dismissed && !isStandalone) {
      setTimeout(() => setShowInstallBanner(true), 3000);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // URLパラメータ処理（キャスト・動画の直接アクセス + 戻る/進む）
  useEffect(() => {
    if (allCasts.length === 0) return;

    // fromPop=false（初回・再読込後）: パラメータが有効なときだけ画面を合わせる。
    //   無効な古いリンクはURLだけ整えて現画面を保つ（再試行等でのeffect再発火時に
    //   学習中のユーザーを強制排出しないため）
    // fromPop=true（ブラウザ戻る/進む）: パラメータなし = ホームへ
    const applyParams = (fromPop: boolean) => {
      const params = new URLSearchParams(window.location.search);
      const castParam = params.get('cast');
      const videoParam = params.get('video');

      if (videoParam) {
        const video = allCasts.flatMap(c => c.videos).find(v => v.id === videoParam);
        if (video) {
          showVideo(video);
          return;
        }
      }
      if (castParam) {
        const cast = allCasts.find(c => c.name === castParam || c.id === castParam);
        if (cast) {
          showCast(cast);
          return;
        }
      }
      if (fromPop) {
        showCastList();
      } else if (castParam || videoParam) {
        window.history.replaceState({}, '', window.location.pathname);
      }
    };

    applyParams(false);

    const handlePopState = () => applyParams(true);
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allCasts]);

  // 並び順モーダルが開いたときにtempOrderを初期化
  useEffect(() => {
    if (showAgencyOrderModal && sortedAgencyNames.length > 0) {
      setTempOrder(sortedAgencyNames);
    }
  }, [showAgencyOrderModal, sortedAgencyNames]);

  // 共通ヘッダーボタン群
  const headerButtons = (
    <>
      {'speechSynthesis' in window && (
        <button onClick={toggleAudio} className="icon-button" title="音声読み上げ">
          <AudioIcon enabled={audioEnabled} />
        </button>
      )}
      <button onClick={toggleTheme} className="icon-button" title="テーマ切り替え">
        <ThemeToggleIcon theme={theme} />
      </button>
      <button onClick={() => setShowHelp(true)} className="icon-button" title="使い方">
        ?
      </button>
    </>
  );

  const helpModal = showHelp && (
    <HelpModal onClose={() => setShowHelp(false)} buildExport={buildExport} doImport={doImport} />
  );

  const vocabListModal = vocabListSource && (
    <VocabListModal
      title={vocabListSource.title}
      cards={vocabListSource.cards}
      progress={progress}
      filter={vocabListFilter}
      onFilterChange={setVocabListFilter}
      onToggle={toggleVocabCheck}
      onClose={handleCloseVocabList}
    />
  );

  const sampleBanner = usingSample && (
    <div className="warning-banner">
      ⚠️ CSVの読み込みに失敗しました。サンプルデータを表示しています。
      <button onClick={loadCSV} className="btn-link">再試行</button>
    </div>
  );

  const warningsBanner = csvWarnings.length > 0 && (
    <div className="warning-banner">
      ⚠️ 語彙データに{csvWarnings.length}件の問題があります（詳細はブラウザのコンソール）
    </div>
  );

  const installBanner = showInstallBanner && <InstallBanner onDismiss={handleDismissInstallBanner} />;

  // ローディング画面
  if (loading) {
    return (
      <div className="app">
        <div className="loading">
          <div className="spinner"></div>
          <p>読み込み中...</p>
        </div>
      </div>
    );
  }

  // キャスト一覧画面
  if (screen === 'cast-list' && allCasts.length > 0) {
    const totalWords = allCasts.reduce((sum, cast) => sum + cast.wordCount, 0);

    return (
      <div className="app">
        <header className="header">
          <div className="header-left">
            <img src="/channel-logo.jpg" alt="Vlingual Channel" className="logo" />
            <h1 className="app-name">Vlingual Cards</h1>
          </div>
          <div className="header-right">
            <button
              onClick={() => setShowAgencyOrderModal(true)}
              className="icon-button"
              title="事務所の並び順を変更"
            >
              ⚙️
            </button>
            {headerButtons}
          </div>
        </header>

        <main className="gallery-container">
          {sampleBanner}
          {warningsBanner}

          {/* 今日の復習 */}
          {dueTodayCount > 0 && (
            <button className="review-entry" onClick={handleStartReview}>
              <span className="review-entry-icon">🔁</span>
              <span className="review-entry-body">
                <span className="review-entry-title">今日の復習 {dueTodayCount}枚</span>
                <span className="review-entry-subtitle">前に学んだ単語をサッと確認しましょう</span>
              </span>
            </button>
          )}

          <h2 className="gallery-title">🎤 キャスト一覧</h2>

          {sortedAgencyNames.map((agencyName) => {
            const casts = agenciesMap.get(agencyName)!;
            return (
              <div key={agencyName} className="agency-section">
                <h3 className="agency-name">{agencyName}</h3>
                <div className="video-grid">
                  {casts.map(cast => {
                    const castCards = cast.videos.flatMap(v => v.cards);
                    const masteredCount = countMastered(castCards, progress);
                    return (
                      <div
                        key={cast.id}
                        className="video-card"
                        onClick={() => handleSelectCast(cast)}
                      >
                        <img
                          src={cast.thumbnailUrl}
                          alt={cast.name}
                          className="video-thumbnail"
                          loading="lazy"
                        />
                        <div className="video-info">
                          <h3 className="video-title">{cast.name}</h3>
                          <p className="video-word-count">
                            🎬 {cast.videos.length}本 • 📖 {cast.wordCount}語
                            {masteredCount > 0 && ` • ✓ ${masteredCount}`}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {allCasts.length > 1 && (
            <div className="video-grid" style={{ marginTop: '2rem' }}>
              <div className="video-card video-card-all" onClick={handleSelectAllCasts}>
                <div className="all-videos-icon">📚</div>
                <div className="video-info">
                  <h3 className="video-title">全ての動画</h3>
                  <p className="video-word-count">📖 {totalWords}語</p>
                  <p className="all-videos-subtitle">すべて学習</p>
                </div>
              </div>
            </div>
          )}
        </main>

        {/* 並び順変更モーダル */}
        {showAgencyOrderModal && (
          <div className="help-modal-overlay" onClick={() => setShowAgencyOrderModal(false)}>
            <div className="help-modal-content agency-order-modal" onClick={(e) => e.stopPropagation()}>
              <button className="help-modal-close" onClick={() => setShowAgencyOrderModal(false)}>
                ×
              </button>
              <h2>⚙️ 事務所の並び順</h2>
              <p className="agency-order-description">
                事務所の表示順を変更できます。「↑」「↓」ボタンで並び替えてください。
              </p>

              <div className="agency-order-list">
                {tempOrder.map((agencyName, index) => (
                  <div key={agencyName} className="agency-order-item">
                    <span className="agency-order-name">{agencyName}</span>
                    <div className="agency-order-buttons">
                      <button
                        onClick={() => moveAgencyUp(index)}
                        disabled={index === 0}
                        className="btn-order-move"
                        title="上に移動"
                      >
                        ↑
                      </button>
                      <button
                        onClick={() => moveAgencyDown(index)}
                        disabled={index === tempOrder.length - 1}
                        className="btn-order-move"
                        title="下に移動"
                      >
                        ↓
                      </button>
                    </div>
                  </div>
                ))}
                <div className="agency-order-actions">
                  <button onClick={handleSaveAgencyOrder} className="btn-save-order">
                    保存
                  </button>
                  <button onClick={() => setShowAgencyOrderModal(false)} className="btn-cancel-order">
                    キャンセル
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {helpModal}
        {installBanner}
      </div>
    );
  }

  // 動画一覧画面
  if (screen === 'video-list' && allVideos.length > 0) {
    const totalWords = allVideos.reduce((sum, v) => sum + v.wordCount, 0);
    return (
      <div className="app">
        <header className="header">
          <div className="header-left">
            <button onClick={handleBackToCastList} className="back-button" title="キャスト選択に戻る">
              ←
            </button>
            <img src="/channel-logo.jpg" alt="Vlingual Channel" className="logo" />
            <h1 className="app-name">{selectedCast ? selectedCast.name : 'Vlingual Cards'}</h1>
          </div>
          <div className="header-right">{headerButtons}</div>
        </header>

        <main className="gallery-container">
          <div className="video-grid">
            {allVideos.map(video => {
              const masteredCount = countMastered(video.cards, progress);
              return (
                <div
                  key={video.id}
                  className="video-card"
                  onClick={() => handleSelectVideo(video)}
                >
                  <img
                    src={video.thumbnailUrl}
                    alt={video.title}
                    className="video-thumbnail"
                    loading="lazy"
                  />
                  <div className="video-info">
                    <h3 className="video-title">{video.title}</h3>
                    <p className="video-word-count">
                      📖 {video.wordCount}語
                      {masteredCount > 0 && ` • ✓ ${masteredCount}定着`}
                    </p>
                    <button
                      className="btn-vocab-list"
                      onClick={(e) => handleOpenVocabListFromGallery(video, e)}
                    >
                      📋 一覧を見る
                    </button>
                  </div>
                </div>
              );
            })}

            {allVideos.length > 1 && (
              <div className="video-card video-card-all" onClick={handleSelectAllVideos}>
                <div className="all-videos-icon">📚</div>
                <div className="video-info">
                  <h3 className="video-title">全ての動画</h3>
                  <p className="video-word-count">📖 {totalWords}語</p>
                  <p className="all-videos-subtitle">すべて学習</p>
                  <button
                    className="btn-vocab-list"
                    onClick={(e) => {
                      e.stopPropagation();
                      openVocabList(
                        selectedCast ? `${selectedCast.name}の全単語` : '全ての動画',
                        allVideos.flatMap(v => v.cards)
                      );
                    }}
                  >
                    📋 一覧を見る
                  </button>
                </div>
              </div>
            )}
          </div>
        </main>

        {vocabListModal}
        {helpModal}
      </div>
    );
  }

  // 学習画面
  const studyTitle =
    scopeId === 'review'
      ? '今日の復習'
      : selectedVideo
        ? selectedVideo.title
        : selectedCast
          ? `${selectedCast.name}｜全動画`
          : '全ての動画';

  // 完了画面用: 同スコープに次のセットがあるか / 明日の復習枚数（完了時のみ計算）
  const isComplete = currentId === null;
  const nextSetSize = isComplete && scopeId
    ? availableSetSize(
        scopeId === 'review' ? allCards : scopeCards,
        progress,
        today,
        { reviewOnly: scopeId === 'review', max: scopeId === 'review' ? REVIEW_LIMIT : SET_SIZE }
      )
    : 0;
  const dueTomorrowCount = isComplete ? countDue(allCards, progress, today + 1) : 0;

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <button onClick={handleBackFromStudy} className="back-button" title="一覧に戻る">
            ←
          </button>
          <img src="/channel-logo.jpg" alt="Vlingual Channel" className="logo" />
          <h1 className="app-name">{studyTitle}</h1>
        </div>
        <div className="header-right">
          {!isComplete && <span className="today-count">残り {queue.length}枚</span>}
          <button onClick={handleOpenVocabListFromStudy} className="icon-button" title="語彙一覧">
            📋
          </button>
          {headerButtons}
        </div>
      </header>

      {sampleBanner}
      {warningsBanner}

      <main className="card-container">
        {currentCard ? (
          <>
            <div
              className={`card ${isFlipped ? 'flipped' : ''} ${isTransitioning ? 'slide-out' : 'slide-in'}`}
              onClick={isTransitioning ? undefined : handleFlip}
              style={{ pointerEvents: isTransitioning ? 'none' : 'auto' }}
            >
              {/* カード表面 */}
              <div className="card-face card-front">
                <div className="card-header">
                  <span
                    className="level-badge"
                    style={{ backgroundColor: getLevelColor(currentCard.難易度) }}
                  >
                    {currentCard.難易度}
                  </span>
                  <span className="part-tag">{currentCard.品詞}</span>
                </div>
                <div className={`card-word ${
                  currentCard.単語.length >= 20 || currentCard.単語.split(/\s+/).length >= 3
                    ? 'long-phrase'
                    : ''
                }`}>
                  {currentCard.単語}
                </div>
                <div className="card-hint">タップしてめくる</div>
              </div>

              {/* カード裏面 */}
              <div className="card-face card-back">
                <div className="card-translation">{currentCard.和訳}</div>
                <div className={`card-context ${currentCard.文脈 ? '' : 'context-pending'}`}>
                  {currentCard.文脈 || '（例文準備中）'}
                </div>
                <div className="card-back-actions">
                  {'speechSynthesis' in window && (
                    <button
                      className="card-audio-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        speakNow(currentCard.単語);
                      }}
                      title="発音を聞く"
                    >
                      🔊
                    </button>
                  )}
                  <a
                    href={currentCard.動画URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="video-link"
                    onClick={(e) => e.stopPropagation()}
                  >
                    ▶ 動画で確認
                  </a>
                </div>
              </div>
            </div>

            {/* 評価ボタン */}
            <div className="rating-buttons">
              <button
                onClick={() => handleRate('again')}
                className="btn-rating btn-again"
                disabled={isTransitioning}
              >
                覚えてない
              </button>
              <button
                onClick={() => handleRate('ok')}
                className="btn-rating btn-ok"
                disabled={isTransitioning}
              >
                だいたいOK
              </button>
              <button
                onClick={() => handleRate('easy')}
                className="btn-rating btn-easy"
                disabled={isTransitioning}
              >
                余裕
              </button>
            </div>
          </>
        ) : (
          <div className="completion-message">
            <div className="completion-icon">🎉</div>
            <h2>{scopeId === 'review' ? '復習おつかれさま！' : '今日のぶん、やり切った！'}</h2>
            <p>
              {dueTomorrowCount > 0
                ? `明日は ${dueTomorrowCount}枚 が復習に来ます`
                : '明日の復習はありません。ゆっくり休みましょう'}
            </p>
            <div className="completion-actions">
              {selectedVideo && (
                <a
                  href={selectedVideo.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-video-primary"
                >
                  ▶ この動画をもう一度見る
                </a>
              )}
              {nextSetSize > 0 && (
                <button
                  onClick={() => scopeId && enterStudy(scopeId, scopeCards)}
                  className="btn-retry"
                >
                  次のセットへ（{nextSetSize}枚）
                </button>
              )}
              <button onClick={handleBackFromStudy} className="btn-secondary">
                一覧へ戻る
              </button>
            </div>
          </div>
        )}
      </main>

      {vocabListModal}
      {helpModal}
      {installBanner}
    </div>
  );
}

export default App;
