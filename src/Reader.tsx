// リスニングリーダー: 公開済みクリップの YouTube 動画を埋め込み、再生位置に合わせて
// 英文を強調・自動スクロールする。文をタップするとその文の頭へシークする。
// 学習進捗（vlc_learning_v1）には一切触れない。保存するのは表示設定（vlc_reader_*）だけ。
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { PlaybackRate, ReaderDoc, ReaderIndexItem, ReaderSentence } from './lib/reader';
import {
  PLAYBACK_RATES,
  activeIndexAt,
  formatTime,
  parsePlaybackRate,
  seekTarget
} from './lib/reader';
import { loadSentenceDoc } from './lib/readerData';
import type { YTPlayer } from './lib/youtubeApi';
import { YT_STATE, loadYouTubeApi } from './lib/youtubeApi';
import { readPreference, writePreference } from './lib/preferences';
import { READER_SHOW_JA_KEY, READER_RATE_KEY } from './types';

const POLL_MS = 100;

function playerErrorMessage(code: number): string {
  // 非公開動画でも 150 が返ることがあるので、原因を断定しない文面にする
  if (code === 101 || code === 150) return 'この動画はここでは再生できません（非公開・埋め込み不可など）。YouTubeで開いてください';
  if (code === 100) return '動画が見つかりません（非公開または削除された可能性があります）';
  return '動画を再生できませんでした';
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function ReaderHeader({ title, onBack, headerButtons }: {
  title: string;
  onBack: () => void;
  headerButtons: ReactNode;
}) {
  return (
    <header className="header">
      <div className="header-left">
        <button onClick={onBack} className="back-button" title="戻る">
          ←
        </button>
        <img src="/channel-logo.jpg" alt="Vlingual Channel" className="logo" />
        <h1 className="app-name">{title}</h1>
      </div>
      <div className="header-right">{headerButtons}</div>
    </header>
  );
}

// リーダーで読める動画の一覧（ホームの「リスニングリーダー」から）
export function ReaderList({ items, onSelect, onBack, headerButtons }: {
  items: ReaderIndexItem[];
  onSelect: (videoId: string) => void;
  onBack: () => void;
  headerButtons: ReactNode;
}) {
  return (
    <>
      <ReaderHeader title="リスニングリーダー" onBack={onBack} headerButtons={headerButtons} />
      <main className="gallery-container">
        <p className="reader-list-lead">
          動画を再生しながら、話している英文を目で追えます。文をタップするとそこから再生します。
        </p>
        <div className="video-grid">
          {items.map(item => (
            <button
              key={item.videoId}
              className="video-card reader-list-card"
              onClick={() => onSelect(item.videoId)}
            >
              <img
                src={`https://img.youtube.com/vi/${item.videoId}/mqdefault.jpg`}
                alt=""
                className="video-thumbnail"
                loading="lazy"
              />
              <span className="video-info">
                <span className="video-title">{item.title}</span>
                <span className="video-word-count">
                  {item.cast && `🎤 ${item.cast} • `}💬 {item.count}文
                </span>
              </span>
            </button>
          ))}
        </div>
      </main>
    </>
  );
}

export function ReaderScreen({ videoId, onBack, headerButtons }: {
  videoId: string;
  onBack: () => void;
  headerButtons: ReactNode;
}) {
  // 文データ
  const [doc, setDoc] = useState<ReaderDoc | null>(null);
  const [dropped, setDropped] = useState(0);
  const [loadFailed, setLoadFailed] = useState(false);
  const sentencesRef = useRef<ReaderSentence[]>([]);

  // プレーヤー
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const [playerReady, setPlayerReady] = useState(false);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // 表示
  const [activeIndex, setActiveIndex] = useState(-1);
  const [follow, setFollow] = useState(true);
  const [showJa, setShowJa] = useState(() => readPreference(READER_SHOW_JA_KEY) === 'true');
  const [rate, setRate] = useState<PlaybackRate>(() => parsePlaybackRate(readPreference(READER_RATE_KEY)));
  const rateRef = useRef<PlaybackRate>(rate);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const stickyRef = useRef<HTMLDivElement>(null);

  const syncFromPlayer = useCallback((player: YTPlayer | null) => {
    if (!player) return;
    let t: number;
    try {
      t = player.getCurrentTime();
    } catch {
      return;
    }
    setActiveIndex(activeIndexAt(sentencesRef.current, t));
  }, []);

  // 文データの読み込み（画面は videoId ごとに key で作り直されるので、初期化は不要）
  useEffect(() => {
    let cancelled = false;
    loadSentenceDoc(videoId)
      .then(parsed => {
        if (cancelled) return;
        sentencesRef.current = parsed.value.sentences;
        setDoc(parsed.value);
        setDropped(parsed.dropped);
        if (parsed.dropped > 0) {
          console.warn('[READER]', { operation: 'loadSentenceDoc', videoId, dropped: parsed.dropped });
        }
        syncFromPlayer(playerRef.current);
      })
      .catch(err => {
        if (cancelled) return;
        console.error('[READER]', {
          operation: 'loadSentenceDoc',
          videoId,
          error: err instanceof Error ? err.message : String(err)
        });
        setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [videoId, syncFromPlayer]);

  // プレーヤー生成（IFrame API はここで初めて読み込む）。
  // YT.Player は渡した要素を iframe に置き換えるので、React が管理しない子要素を作って渡す
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let player: YTPlayer | null = null;
    const target = document.createElement('div');
    host.appendChild(target);

    loadYouTubeApi()
      .then(YT => {
        if (cancelled) return;
        player = new YT.Player(target, {
          videoId,
          width: '100%',
          height: '100%',
          playerVars: { playsinline: 1, rel: 0, origin: window.location.origin },
          events: {
            onReady: e => {
              if (cancelled) return;
              playerRef.current = e.target;
              try {
                e.target.setPlaybackRate(rateRef.current);
              } catch {
                // 速度変更できなくても再生は続ける
              }
              setPlayerReady(true);
            },
            onStateChange: e => {
              if (cancelled) return;
              setIsPlaying(e.data === YT_STATE.PLAYING);
              syncFromPlayer(e.target);
            },
            onError: e => {
              if (cancelled) return;
              setPlayerError(playerErrorMessage(e.data));
            }
          }
        });
      })
      .catch(() => {
        if (!cancelled) setPlayerError('動画プレーヤーを読み込めませんでした。通信環境を確認してください');
      });

    return () => {
      cancelled = true;
      playerRef.current = null;
      try {
        player?.destroy();
      } catch {
        // 破棄に失敗しても DOM は下で片付ける
      }
      host.replaceChildren();
    };
  }, [videoId, syncFromPlayer]);

  // 再生中だけ位置をポーリングする
  useEffect(() => {
    if (!isPlaying) return;
    const timer = setInterval(() => syncFromPlayer(playerRef.current), POLL_MS);
    return () => clearInterval(timer);
  }, [isPlaying, syncFromPlayer]);

  // 自動スクロール（利用者が自分でスクロールしたら止める）。
  // 上に sticky のプレーヤーがあるので scrollIntoView の center ではなく、
  // プレーヤーの下に残った領域の上から 1/3 あたりへ現在の文を置く
  useEffect(() => {
    if (!follow || activeIndex < 0) return;
    const el = itemRefs.current[activeIndex];
    if (!el) return;
    const stickyBottom = stickyRef.current?.getBoundingClientRect().bottom ?? 0;
    const rect = el.getBoundingClientRect();
    const room = window.innerHeight - stickyBottom;
    const desiredTop = stickyBottom + Math.max(8, (room - rect.height) / 3);
    const delta = rect.top - desiredTop;
    if (Math.abs(delta) < 4) return;
    window.scrollBy({ top: delta, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }, [activeIndex, follow]);

  // 手動スクロールの検出: プログラムによる scrollIntoView では wheel/touchmove/キーは発火しない
  useEffect(() => {
    const stop = () => setFollow(false);
    const onKey = (e: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(e.key)) stop();
    };
    window.addEventListener('wheel', stop, { passive: true });
    window.addEventListener('touchmove', stop, { passive: true });
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('wheel', stop);
      window.removeEventListener('touchmove', stop);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const handleSeek = (index: number) => {
    const sentence = doc?.sentences[index];
    if (!sentence) return;
    setActiveIndex(index);
    setFollow(true);
    const player = playerRef.current;
    if (!player) return;
    try {
      player.seekTo(seekTarget(sentence), true);
      if (player.getPlayerState() !== YT_STATE.PLAYING) player.playVideo();
    } catch {
      // プレーヤーが壊れていても一覧の操作は続けられる
    }
  };

  const handleRate = (next: PlaybackRate) => {
    setRate(next);
    rateRef.current = next;
    writePreference(READER_RATE_KEY, String(next));
    try {
      playerRef.current?.setPlaybackRate(next);
    } catch {
      // no-op
    }
  };

  const toggleJa = () => {
    const next = !showJa;
    setShowJa(next);
    writePreference(READER_SHOW_JA_KEY, String(next));
  };

  const hasJa = doc?.sentences.some(s => s.ja) ?? false;
  const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;

  return (
    <>
      <ReaderHeader
        title={doc?.title || 'リスニングリーダー'}
        onBack={onBack}
        headerButtons={headerButtons}
      />

      <main className="reader-container">
        <div className="reader-sticky" ref={stickyRef}>
          <div className="reader-player" ref={hostRef} />
          <div className="reader-controls">
            <div className="reader-rate" role="group" aria-label="再生速度">
              {PLAYBACK_RATES.map(r => (
                <button
                  key={r}
                  className={`reader-chip ${rate === r ? 'active' : ''}`}
                  aria-pressed={rate === r}
                  onClick={() => handleRate(r)}
                  disabled={!playerReady}
                >
                  {r}x
                </button>
              ))}
            </div>
            {hasJa && (
              <button
                className={`reader-chip ${showJa ? 'active' : ''}`}
                aria-pressed={showJa}
                onClick={toggleJa}
              >
                和訳 {showJa ? 'ON' : 'OFF'}
              </button>
            )}
          </div>
        </div>

        {playerError && (
          <div className="warning-banner">
            ⚠️ {playerError}
            <a href={youtubeUrl} target="_blank" rel="noopener noreferrer" className="btn-link">
              YouTubeで開く
            </a>
          </div>
        )}
        {dropped > 0 && (
          <div className="warning-banner">⚠️ 読み込めない文が{dropped}件ありました（詳細はブラウザのコンソール）</div>
        )}

        <p className="reader-note">
          ※ iPhone / Safari では画面をロックすると再生が止まることがあります
        </p>

        {loadFailed ? (
          <div className="reader-empty">
            <p>この動画の英文はまだ用意されていません。</p>
            <button className="btn-secondary" onClick={onBack}>戻る</button>
          </div>
        ) : !doc ? (
          <div className="reader-empty">
            <div className="spinner"></div>
          </div>
        ) : doc.sentences.length === 0 ? (
          <div className="reader-empty">
            <p>表示できる英文がありません。</p>
          </div>
        ) : (
          <ol className="reader-list">
            {doc.sentences.map((s, idx) => {
              const translated = s.spoken === 'ja';
              const classes = [
                'reader-sentence',
                idx === activeIndex ? 'active' : '',
                translated ? 'spoken-ja' : ''
              ].filter(Boolean).join(' ');
              return (
                <li key={`${s.i}-${s.start}`}>
                  <button
                    ref={el => { itemRefs.current[idx] = el; }}
                    className={classes}
                    aria-current={idx === activeIndex ? 'true' : undefined}
                    onClick={() => handleSeek(idx)}
                  >
                    <span className="reader-sentence-meta">
                      <span className="reader-time">{formatTime(s.start)}</span>
                      {translated && <span className="reader-ja-label">日本語の発話（英訳）</span>}
                    </span>
                    <span className="reader-en">{s.en}</span>
                    {showJa && s.ja && <span className="reader-ja">{s.ja}</span>}
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </main>

      {!follow && activeIndex >= 0 && (
        <button className="reader-resume" onClick={() => setFollow(true)}>
          現在位置へ
        </button>
      )}
    </>
  );
}
