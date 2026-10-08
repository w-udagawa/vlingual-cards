import { describe, it, expect } from 'vitest';
import type { ReaderSentence } from '../reader';
import {
  HIGHLIGHT_LEAD_SEC,
  SEEK_LEAD_SEC,
  activeIndexAt,
  findActiveIndex,
  formatTime,
  isValidYouTubeId,
  normalizeSentences,
  parsePlaybackRate,
  parseSentence,
  parseSentenceDoc,
  parseSentenceIndex,
  seekTarget
} from '../reader';
// 開発用の手書きフィクスチャ（public/ の外なので本番には入らない）も契約どおりか確かめる
import fixtureDocRaw from '../../../fixtures/sentences/OLQi4EiMY7Q.json?raw';
import fixtureIndexRaw from '../../../fixtures/sentences/index.json?raw';

const s = (i: number, start: number, end: number, extra: Partial<ReaderSentence> = {}): ReaderSentence => ({
  i,
  start,
  end,
  en: `sentence ${i}`,
  ja: null,
  spoken: 'en',
  ...extra
});

// 0: 1.0-3.0 / 隙間 / 1: 5.0-7.0 / 2: 7.0-9.5（隙間なし） / 隙間 / 3: 20.0-22.0
const LIST = [s(0, 1, 3), s(1, 5, 7), s(2, 7, 9.5), s(3, 20, 22)];

describe('findActiveIndex', () => {
  it('空の一覧は常に -1', () => {
    expect(findActiveIndex([], 0)).toBe(-1);
    expect(findActiveIndex([], 100)).toBe(-1);
  });

  it('最初の文より前は -1', () => {
    expect(findActiveIndex(LIST, 0)).toBe(-1);
    expect(findActiveIndex(LIST, 0.999)).toBe(-1);
  });

  it('文の中ではその文', () => {
    expect(findActiveIndex(LIST, 2)).toBe(0);
    expect(findActiveIndex(LIST, 6)).toBe(1);
    expect(findActiveIndex(LIST, 21)).toBe(3);
  });

  it('境界: start ちょうどはその文に入る（前の文の end と同時刻なら後ろの文）', () => {
    expect(findActiveIndex(LIST, 1)).toBe(0);
    expect(findActiveIndex(LIST, 5)).toBe(1);
    expect(findActiveIndex(LIST, 7)).toBe(2);
  });

  it('隙間（無音）では直前の文を保つ', () => {
    expect(findActiveIndex(LIST, 3.5)).toBe(0);
    expect(findActiveIndex(LIST, 4.999)).toBe(0);
    expect(findActiveIndex(LIST, 15)).toBe(2);
  });

  it('最後の文の後も最後の文を保つ', () => {
    expect(findActiveIndex(LIST, 9999)).toBe(3);
  });

  it('NaN / Infinity でも落ちない', () => {
    expect(findActiveIndex(LIST, Number.NaN)).toBe(-1);
    expect(findActiveIndex(LIST, Number.POSITIVE_INFINITY)).toBe(-1);
  });

  it('要素 1 個でも正しく動く', () => {
    const one = [s(0, 10, 12)];
    expect(findActiveIndex(one, 9)).toBe(-1);
    expect(findActiveIndex(one, 10)).toBe(0);
    expect(findActiveIndex(one, 50)).toBe(0);
  });

  it('大きな一覧でも線形探索と一致する', () => {
    const big = Array.from({ length: 500 }, (_, k) => s(k, k * 3, k * 3 + 2));
    for (const t of [-1, 0, 1.5, 2.5, 299, 300, 1000, 1497.9, 1498, 5000]) {
      const linear = big.reduce((acc, x, k) => (x.start <= t ? k : acc), -1);
      expect(findActiveIndex(big, t)).toBe(linear);
    }
  });
});

describe('activeIndexAt / seekTarget', () => {
  it('強調の先行幅はシークの手前幅より大きい（シーク直後に前の文が光らない）', () => {
    expect(HIGHLIGHT_LEAD_SEC).toBeGreaterThan(SEEK_LEAD_SEC);
    for (let k = 0; k < LIST.length; k++) {
      expect(activeIndexAt(LIST, seekTarget(LIST[k]))).toBe(k);
    }
  });

  it('seekTarget は 0 未満にならない', () => {
    expect(seekTarget({ start: 0.05 })).toBe(0);
    expect(seekTarget({ start: 10 })).toBeCloseTo(10 - SEEK_LEAD_SEC);
  });
});

describe('normalizeSentences', () => {
  it('開始時刻順に並べ替える（入力は書き換えない）', () => {
    const input = [s(2, 7, 9), s(0, 1, 3), s(1, 5, 7)];
    const out = normalizeSentences(input);
    expect(out.map(x => x.i)).toEqual([0, 1, 2]);
    expect(input.map(x => x.i)).toEqual([2, 0, 1]);
  });

  it('同時刻は i の順、i も同じなら元の順（安定）', () => {
    const a = s(1, 5, 6, { en: 'a' });
    const b = s(0, 5, 6, { en: 'b' });
    const c = s(0, 5, 6, { en: 'c' });
    expect(normalizeSentences([a, b, c]).map(x => x.en)).toEqual(['b', 'c', 'a']);
  });

  it('並んでいない入力でも正規化すれば二分探索が正しい', () => {
    const shuffled = normalizeSentences([LIST[3], LIST[0], LIST[2], LIST[1]]);
    expect(findActiveIndex(shuffled, 8)).toBe(2);
    expect(findActiveIndex(shuffled, 15)).toBe(2);
  });
});

describe('parseSentence', () => {
  it('正しい行を読む（前後の空白は落とす・空の ja は null）', () => {
    expect(parseSentence({ i: 3, start: 1, end: 2, en: ' Hi. ', ja: ' ', spoken: 'en' }, 0)).toEqual({
      i: 3, start: 1, end: 2, en: 'Hi.', ja: null, spoken: 'en'
    });
  });

  it('spoken は en / ja 以外を null に寄せる', () => {
    expect(parseSentence({ start: 1, end: 2, en: 'x', spoken: 'zh' }, 0)?.spoken).toBeNull();
    expect(parseSentence({ start: 1, end: 2, en: 'x' }, 0)?.spoken).toBeNull();
    expect(parseSentence({ start: 1, end: 2, en: 'x', spoken: 'ja' }, 0)?.spoken).toBe('ja');
  });

  it('i が無ければ配列上の位置を使う', () => {
    expect(parseSentence({ start: 1, end: 2, en: 'x' }, 7)?.i).toBe(7);
  });

  it('壊れた行は null', () => {
    const bad: unknown[] = [
      null,
      'text',
      [],
      { start: '1', end: 2, en: 'x' },
      { start: 1, end: Number.NaN, en: 'x' },
      { start: -1, end: 2, en: 'x' },
      { start: 3, end: 2, en: 'x' },
      { start: 1, end: 2, en: '' },
      { start: 1, end: 2, en: '   ' },
      { start: 1, end: 2, en: 42 }
    ];
    for (const row of bad) expect(parseSentence(row, 0)).toBeNull();
  });

  it('start === end（一瞬の行）は受け付ける', () => {
    expect(parseSentence({ start: 2, end: 2, en: 'x' }, 0)).not.toBeNull();
  });
});

describe('parseSentenceDoc', () => {
  const valid = {
    version: 1,
    videoId: 'OLQi4EiMY7Q',
    clipId: 271,
    title: ' Title ',
    cast: 'Cast',
    durationSec: 120.5,
    sentences: [
      { i: 1, start: 5, end: 6, en: 'second', ja: '二', spoken: 'en' },
      { i: 0, start: 1, end: 2, en: 'first', ja: null, spoken: 'ja' }
    ]
  };

  it('正しい文書を読み、文を開始時刻順にそろえる', () => {
    const parsed = parseSentenceDoc(valid);
    expect(parsed).not.toBeNull();
    expect(parsed!.dropped).toBe(0);
    expect(parsed!.value.title).toBe('Title');
    expect(parsed!.value.clipId).toBe(271);
    expect(parsed!.value.durationSec).toBe(120.5);
    expect(parsed!.value.sentences.map(x => x.en)).toEqual(['first', 'second']);
  });

  it('壊れた行だけ捨てて件数を返す', () => {
    const parsed = parseSentenceDoc({
      ...valid,
      sentences: [...valid.sentences, { start: 'x' }, null, { start: 9, end: 1, en: 'bad' }]
    });
    expect(parsed!.value.sentences).toHaveLength(2);
    expect(parsed!.dropped).toBe(3);
  });

  it('durationSec は null / 0 / 文字列なら null', () => {
    expect(parseSentenceDoc({ ...valid, durationSec: null })!.value.durationSec).toBeNull();
    expect(parseSentenceDoc({ ...valid, durationSec: 0 })!.value.durationSec).toBeNull();
    expect(parseSentenceDoc({ ...valid, durationSec: '12' })!.value.durationSec).toBeNull();
  });

  it('文が 0 件でも文書としては読める', () => {
    const parsed = parseSentenceDoc({ ...valid, sentences: [] });
    expect(parsed!.value.sentences).toEqual([]);
    expect(parsed!.dropped).toBe(0);
  });

  it('全体が読めないものは null', () => {
    expect(parseSentenceDoc(null)).toBeNull();
    expect(parseSentenceDoc('{}')).toBeNull();
    expect(parseSentenceDoc([])).toBeNull();
    expect(parseSentenceDoc({ ...valid, version: 2 })).toBeNull();
    expect(parseSentenceDoc({ ...valid, version: '1' })).toBeNull();
    expect(parseSentenceDoc({ ...valid, videoId: 'short' })).toBeNull();
    expect(parseSentenceDoc({ ...valid, videoId: '../../etc/pa' })).toBeNull();
    expect(parseSentenceDoc({ ...valid, sentences: 'nope' })).toBeNull();
    const { sentences: _omit, ...noSentences } = valid;
    void _omit;
    expect(parseSentenceDoc(noSentences)).toBeNull();
  });

  it('要求した動画 ID と中身が食い違えば null（取り違え防止）', () => {
    expect(parseSentenceDoc(valid, 'OLQi4EiMY7Q')).not.toBeNull();
    expect(parseSentenceDoc(valid, 'AAAAAAAAAAA')).toBeNull();
  });
});

describe('parseSentenceIndex', () => {
  it('正しい一覧を読む', () => {
    const parsed = parseSentenceIndex({
      version: 1,
      items: [{ videoId: 'OLQi4EiMY7Q', clipId: 3, title: 'T', cast: 'C', count: 12 }]
    });
    expect(parsed).toEqual({
      value: [{ videoId: 'OLQi4EiMY7Q', clipId: 3, title: 'T', cast: 'C', count: 12 }],
      dropped: 0
    });
  });

  it('不正な videoId・重複は捨て、欠けた項目は既定値で埋める', () => {
    const parsed = parseSentenceIndex({
      version: 1,
      items: [
        { videoId: 'OLQi4EiMY7Q', count: 3.7 },
        { videoId: 'OLQi4EiMY7Q', title: 'dup' },
        { videoId: 'bad' },
        null,
        { videoId: 'AAAAAAAAAAA', title: 'x', count: -5, clipId: null }
      ]
    });
    expect(parsed!.dropped).toBe(3);
    expect(parsed!.value).toEqual([
      { videoId: 'OLQi4EiMY7Q', clipId: null, title: 'OLQi4EiMY7Q', cast: '', count: 3 },
      { videoId: 'AAAAAAAAAAA', clipId: null, title: 'x', cast: '', count: 0 }
    ]);
  });

  it('空の items は空配列（呼び出し側が導線を隠す）', () => {
    expect(parseSentenceIndex({ version: 1, items: [] })!.value).toEqual([]);
  });

  it('全体が読めないものは null', () => {
    expect(parseSentenceIndex(undefined)).toBeNull();
    expect(parseSentenceIndex({ version: 2, items: [] })).toBeNull();
    expect(parseSentenceIndex({ version: 1 })).toBeNull();
    expect(parseSentenceIndex({ version: 1, items: {} })).toBeNull();
  });
});

describe('小物', () => {
  it('isValidYouTubeId', () => {
    expect(isValidYouTubeId('OLQi4EiMY7Q')).toBe(true);
    expect(isValidYouTubeId('a-b_c123456')).toBe(true);
    expect(isValidYouTubeId('OLQi4EiMY7')).toBe(false);
    expect(isValidYouTubeId('OLQi4EiMY7Q?')).toBe(false);
    expect(isValidYouTubeId(null)).toBe(false);
  });

  it('parsePlaybackRate は候補外を 1 に寄せる', () => {
    expect(parsePlaybackRate('0.75')).toBe(0.75);
    expect(parsePlaybackRate('1.25')).toBe(1.25);
    expect(parsePlaybackRate('2')).toBe(1);
    expect(parsePlaybackRate('abc')).toBe(1);
    expect(parsePlaybackRate(null)).toBe(1);
  });

  it('formatTime', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(5.9)).toBe('0:05');
    expect(formatTime(65)).toBe('1:05');
    expect(formatTime(3725)).toBe('1:02:05');
    expect(formatTime(-3)).toBe('0:00');
    expect(formatTime(Number.NaN)).toBe('0:00');
  });
});

describe('開発用フィクスチャ', () => {
  it('fixtures/sentences は契約どおりで、1 行も落ちない', () => {
    const doc = parseSentenceDoc(JSON.parse(fixtureDocRaw), 'OLQi4EiMY7Q');
    expect(doc).not.toBeNull();
    expect(doc!.dropped).toBe(0);
    expect(doc!.value.sentences.some(x => x.spoken === 'ja')).toBe(true);

    const index = parseSentenceIndex(JSON.parse(fixtureIndexRaw));
    expect(index!.dropped).toBe(0);
    expect(index!.value[0].count).toBe(doc!.value.sentences.length);
  });
});
