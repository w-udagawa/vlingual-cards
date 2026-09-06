import { afterEach, describe, expect, it, vi } from 'vitest';
import { readPreference, writePreference } from '../preferences';

afterEach(() => { vi.unstubAllGlobals(); });

describe('設定ストレージが利用不能な環境', () => {
  it('読み書きの例外を画面初期化へ伝播しない', () => {
    vi.stubGlobal('localStorage', {
      getItem() { throw new Error('SecurityError'); },
      setItem() { throw new Error('QuotaExceededError'); },
    });
    expect(readPreference('theme')).toBeNull();
    expect(writePreference('theme', 'dark')).toBe(false);
  });
});
