import { describe, it, expect } from 'vitest';
import { parseCsvRows, parseVocabCsv, extractYouTubeId, attachCardIds } from '../csv';
import { cardId, normalizeWord } from '../ids';

const HEADER = '単語,和訳,難易度,品詞,文脈,動画URL,動画タイトル,事務所,キャスト名';
const row = (word: string, extra: Partial<Record<string, string>> = {}) =>
  [
    word,
    extra['和訳'] ?? '訳',
    extra['難易度'] ?? '中級',
    extra['品詞'] ?? '名詞',
    extra['文脈'] ?? `I said ${word}.`,
    extra['動画URL'] ?? 'https://youtu.be/vid00000001',
    extra['動画タイトル'] ?? 'タイトル',
    extra['事務所'] ?? 'にじさんじ',
    extra['キャスト名'] ?? 'ペトラグリン',
  ].join(',');

describe('parseCsvRows (RFC 4180)', () => {
  it('引用符内のカンマ・エスケープされた引用符を扱える', () => {
    const rows = parseCsvRows('a,"b,c","he said ""hi"""\n');
    expect(rows).toEqual([['a', 'b,c', 'he said "hi"']]);
  });

  it('引用符内の改行を扱える（現行パーサで壊れていたケース）', () => {
    const rows = parseCsvRows('a,"line1\nline2",c');
    expect(rows).toEqual([['a', 'line1\nline2', 'c']]);
  });

  it('CRLFとBOMを扱える', () => {
    const rows = parseCsvRows('﻿a,b\r\nc,d\r\n');
    expect(rows).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });
});

describe('parseVocabCsv', () => {
  it('9列形式（実データのヘッダー）をパースできる', () => {
    const { cards, warnings } = parseVocabCsv([HEADER, row('hello')].join('\n'));
    expect(cards).toHaveLength(1);
    expect(warnings).toHaveLength(0);
    expect(cards[0].id).toBe('vid00000001::hello');
    expect(cards[0].videoId).toBe('vid00000001');
    expect(cards[0].キャスト名).toBe('ペトラグリン');
  });

  it('旧「タレント」列名をキャスト名として読む', () => {
    const text = [HEADER.replace('キャスト名', 'タレント'), row('hello')].join('\n');
    const { cards } = parseVocabCsv(text);
    expect(cards[0].キャスト名).toBe('ペトラグリン');
  });

  it('6列形式（後方互換）をパースできる', () => {
    const text = ['単語,和訳,難易度,品詞,文脈,動画URL', 'hi,やあ,初級,間投詞,Hi there,https://youtu.be/vid00000001'].join('\n');
    const { cards } = parseVocabCsv(text);
    expect(cards).toHaveLength(1);
    expect(cards[0].動画タイトル).toBeUndefined();
  });

  it('列順が変わっても名前で解決する', () => {
    const text = ['動画URL,単語,和訳,難易度,品詞,文脈', 'https://youtu.be/vid00000001,hi,やあ,初級,間投詞,Hi'].join('\n');
    const { cards } = parseVocabCsv(text);
    expect(cards[0].単語).toBe('hi');
  });

  it('未知の追加列（例: タイムスタンプ）があっても壊れない', () => {
    const text = [HEADER + ',開始秒', row('hello') + ',123'].join('\n');
    const { cards } = parseVocabCsv(text);
    expect(cards).toHaveLength(1);
  });

  it('必須列が欠けると構造エラー', () => {
    expect(() => parseVocabCsv('単語,和訳\nhi,やあ')).toThrow(/必須列/);
  });

  it('難易度不正の行はスキップし警告に収集（無言で消さない）', () => {
    const bad = row('slangword', { 難易度: 'スラング' });
    const { cards, warnings } = parseVocabCsv([HEADER, row('ok-word'), bad].join('\n'));
    expect(cards).toHaveLength(1);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('slangword');
    expect(warnings[0]).toContain('難易度');
  });

  it('品詞「スラング」は有効（難易度とは別の列）', () => {
    const { cards, warnings } = parseVocabCsv(
      [HEADER, row('aura farming', { 品詞: 'スラング', 難易度: '上級' })].join('\n')
    );
    expect(cards).toHaveLength(1);
    expect(warnings).toHaveLength(0);
  });

  it('同一動画内の重複は初出行に統合し警告', () => {
    const { cards, warnings } = parseVocabCsv([HEADER, row('dup'), row('dup')].join('\n'));
    expect(cards).toHaveLength(1);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('重複');
  });

  it('別動画の同一単語は別カード', () => {
    const other = row('same', { 動画URL: 'https://youtu.be/vid00000002' });
    const { cards } = parseVocabCsv([HEADER, row('same'), other].join('\n'));
    expect(cards).toHaveLength(2);
    expect(cards[0].id).not.toBe(cards[1].id);
  });

  it('空行は無視する', () => {
    const { cards } = parseVocabCsv([HEADER, row('a'), '', row('b')].join('\n'));
    expect(cards).toHaveLength(2);
  });

  it('ファイル先頭の空行があってもヘッダーを正しく認識する（旧trim()相当）', () => {
    const { cards } = parseVocabCsv(['', '', HEADER, row('a')].join('\n'));
    expect(cards).toHaveLength(1);
  });

  it('和訳が空の行はスキップし警告（空白カードを出題しない）', () => {
    const { cards, warnings } = parseVocabCsv([HEADER, row('ok-word'), row('naked', { 和訳: '' })].join('\n'));
    expect(cards).toHaveLength(1);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('和訳');
  });

  it('文脈が空でもカードは有効（例文準備中）', () => {
    const { cards } = parseVocabCsv([HEADER, row('nocontext', { 文脈: '' })].join('\n'));
    expect(cards).toHaveLength(1);
    expect(cards[0].文脈).toBe('');
  });
});

describe('extractYouTubeId', () => {
  it('主要なURL形式と?si=付きを処理できる', () => {
    expect(extractYouTubeId('https://youtu.be/abc123XYZ_-')).toBe('abc123XYZ_-');
    expect(extractYouTubeId('https://youtu.be/abc123?si=tracking')).toBe('abc123');
    expect(extractYouTubeId('https://youtube.com/watch?v=abc123&t=10')).toBe('abc123');
    expect(extractYouTubeId('not a url')).toBeNull();
  });

  it('#フラグメントをIDに含めない・shorts/liveにも対応する', () => {
    expect(extractYouTubeId('https://www.youtube.com/watch?v=abc123#t=1m30s')).toBe('abc123');
    expect(extractYouTubeId('https://youtu.be/abc123#share')).toBe('abc123');
    expect(extractYouTubeId('https://www.youtube.com/shorts/xYz_9')).toBe('xYz_9');
    expect(extractYouTubeId('https://www.youtube.com/live/liveId1')).toBe('liveId1');
  });
});

describe('ids', () => {
  it('normalizeWordはNFC+trim+空白圧縮', () => {
    expect(normalizeWord('  hold  on ')).toBe('hold on');
    expect(normalizeWord('éclair')).toBe('éclair'); // NFC合成
  });
  it('cardIdは正規化済み単語を使う', () => {
    expect(cardId('vid1', ' hold  on ')).toBe('vid1::hold on');
  });
});

describe('attachCardIds', () => {
  const input = {
    単語: 'accomplish',
    和訳: '達成する',
    難易度: '中級' as const,
    品詞: '動詞',
    文脈: 'x',
    動画URL: 'https://youtu.be/dQw4w9WgXcQ',
  };

  it('SAMPLE_DATA形式にIDを付与する', () => {
    const cards = attachCardIds([input]);
    expect(cards[0].id).toBe('dQw4w9WgXcQ::accomplish');
    expect(cards[0].videoId).toBe('dQw4w9WgXcQ');
  });

  it('重複IDは初出を採用する', () => {
    const cards = attachCardIds([input, { ...input, 和訳: '別訳' }]);
    expect(cards).toHaveLength(1);
    expect(cards[0].和訳).toBe('達成する');
  });
});
