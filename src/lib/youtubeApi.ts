// YouTube IFrame Player API の遅延読み込み。
// リーダー画面を開いたときに初めて <script> を差し込む（他の画面では一切読み込まない）。
// 型は使う範囲だけを手書きする（@types/youtube を足さない）。

export interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getPlayerState(): number;
  setPlaybackRate(rate: number): void;
  destroy(): void;
}

export interface YTPlayerEvent {
  target: YTPlayer;
  data: number;
}

export interface YTNamespace {
  Player: new (
    el: HTMLElement,
    options: {
      videoId: string;
      width?: string | number;
      height?: string | number;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: (e: YTPlayerEvent) => void;
        onStateChange?: (e: YTPlayerEvent) => void;
        onError?: (e: YTPlayerEvent) => void;
      };
    }
  ) => YTPlayer;
}

/** YT.PlayerState の値（API 読み込み前でも参照できるよう定数で持つ） */
export const YT_STATE = {
  UNSTARTED: -1,
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5,
} as const;

const SCRIPT_SRC = 'https://www.youtube.com/iframe_api';
const LOAD_TIMEOUT_MS = 15000;

type YTWindow = Window & {
  YT?: YTNamespace & { loaded?: number };
  onYouTubeIframeAPIReady?: () => void;
};

let pending: Promise<YTNamespace> | null = null;

export function loadYouTubeApi(): Promise<YTNamespace> {
  const w = window as YTWindow;
  if (w.YT?.Player) return Promise.resolve(w.YT);
  if (pending) return pending;

  pending = new Promise<YTNamespace>((resolve, reject) => {
    const timer = setTimeout(() => fail(new Error('YouTube API load timeout')), LOAD_TIMEOUT_MS);
    const prevReady = w.onYouTubeIframeAPIReady;

    function fail(err: Error) {
      clearTimeout(timer);
      pending = null; // 次に開いたときに再挑戦できるように
      reject(err);
    }

    w.onYouTubeIframeAPIReady = () => {
      clearTimeout(timer);
      prevReady?.();
      if (w.YT?.Player) resolve(w.YT);
      else fail(new Error('YouTube API missing'));
    };

    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onerror = () => {
      script.remove();
      fail(new Error('YouTube API script failed'));
    };
    document.head.appendChild(script);
  });
  return pending;
}
