import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// @vercel/analytics の track をモック（実際のスクリプト注入やネットワーク送信はしない）
vi.mock('@vercel/analytics', () => ({
  track: vi.fn(),
}));

import { track } from '@vercel/analytics';
import { resetEventGuards, trackEvent } from '../analytics';

// sessionStorageの簡易モック（jsdom不要。length/key()も実装し、本物のStorageに近づける。
// store.test.ts の MemoryStorage と同じ考え方）
class MemoryStorage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }
  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.map.set(key, String(value));
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  clear() {
    this.map.clear();
  }
}

const mockedTrack = vi.mocked(track);

beforeEach(() => {
  mockedTrack.mockClear();
  mockedTrack.mockReset();
  vi.stubGlobal('sessionStorage', new MemoryStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('trackEvent', () => {
  it('イベント名と2個までのプリミティブなプロパティをそのまま転送する', () => {
    trackEvent('video_return', { video_id: 'abc123', placement: 'card' });

    expect(mockedTrack).toHaveBeenCalledTimes(1);
    expect(mockedTrack).toHaveBeenCalledWith('video_return', {
      video_id: 'abc123',
      placement: 'card',
    });
  });

  it('3個目以降のプロパティと非プリミティブな値を落とす', () => {
    trackEvent('video_return', {
      video_id: 'abc123',
      placement: 'card',
      extra: 'should be dropped',
      nested: { oops: true },
    });

    expect(mockedTrack).toHaveBeenCalledTimes(1);
    const [, props] = mockedTrack.mock.calls[0];
    expect(props).toEqual({ video_id: 'abc123', placement: 'card' });
  });

  it('プロパティなしでも呼び出せる', () => {
    trackEvent('review_start');

    expect(mockedTrack).toHaveBeenCalledTimes(1);
    expect(mockedTrack).toHaveBeenCalledWith('review_start', undefined);
  });

  it('VITE_ANALYTICS_EVENTS=off のときは何もしない', () => {
    vi.stubEnv('VITE_ANALYTICS_EVENTS', 'off');

    trackEvent('deck_open', { video_id: 'abc123', entry_source: 'app' });

    expect(mockedTrack).not.toHaveBeenCalled();
  });

  it('track が関数として提供されない環境（テスト/SSR相当）では何もしない', async () => {
    vi.resetModules();
    vi.doMock('@vercel/analytics', () => ({ track: undefined }));

    const { trackEvent: trackEventWithoutTrack } = await import('../analytics');
    expect(() =>
      trackEventWithoutTrack('video_return', { video_id: 'abc123', placement: 'card' })
    ).not.toThrow();
    expect(mockedTrack).not.toHaveBeenCalled();

    vi.doUnmock('@vercel/analytics');
    vi.resetModules();
  });

  it('track が例外を投げても呼び出し元には伝播しない', () => {
    mockedTrack.mockImplementation(() => {
      throw new Error('network error');
    });

    expect(() => trackEvent('study_start', { video_id: 'abc123', session_mode: 'video' })).not.toThrow();
  });
});

describe('セッションガード（deck_open / study_start / study_complete / review_start）', () => {
  it('同じデッキへの2回目の deck_open は送らない', () => {
    trackEvent('deck_open', { video_id: 'abc123', entry_source: 'link' });
    trackEvent('deck_open', { video_id: 'abc123', entry_source: 'app' });

    expect(mockedTrack).toHaveBeenCalledTimes(1);
  });

  it('別のデッキの deck_open は送る', () => {
    trackEvent('deck_open', { video_id: 'abc123', entry_source: 'link' });
    trackEvent('deck_open', { video_id: 'xyz789', entry_source: 'link' });

    expect(mockedTrack).toHaveBeenCalledTimes(2);
  });

  it('study_start / study_complete も同じデッキ+モードなら2回目以降は送らない', () => {
    trackEvent('study_start', { video_id: 'abc123', session_mode: 'video' });
    trackEvent('study_start', { video_id: 'abc123', session_mode: 'video' });
    trackEvent('study_complete', { video_id: 'abc123', session_mode: 'video' });
    trackEvent('study_complete', { video_id: 'abc123', session_mode: 'video' });

    expect(mockedTrack).toHaveBeenCalledTimes(2);
  });

  it('video_return はガードされず毎回送る', () => {
    trackEvent('video_return', { video_id: 'abc123', placement: 'card' });
    trackEvent('video_return', { video_id: 'abc123', placement: 'card' });

    expect(mockedTrack).toHaveBeenCalledTimes(2);
  });

  it('resetEventGuards を呼ぶと同じデッキの deck_open が再び送れる', () => {
    trackEvent('deck_open', { video_id: 'abc123', entry_source: 'link' });
    resetEventGuards();
    trackEvent('deck_open', { video_id: 'abc123', entry_source: 'link' });

    expect(mockedTrack).toHaveBeenCalledTimes(2);
  });
});
