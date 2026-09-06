import { expect, it } from 'vitest';
import { groupCardsByCast } from '../catalog';
import { attachCardIds } from '../csv';
import type { VocabCardInput } from '../../types';

it('追記した動画を先頭・代表画像にし、既存動画のタイトルと入力順を保持する', () => {
  const row = (word: string, video: string, title: string): VocabCardInput => ({
    単語: word, 和訳: '訳', 難易度: '中級', 品詞: '名詞', 文脈: '',
    動画URL: `https://youtu.be/${video}`, 動画タイトル: title, キャスト名: 'ペトラ', 事務所: 'にじさんじ',
  });
  const cards = attachCardIds([
    row('one', 'vid00000001', '初出タイトル'),
    row('two', 'vid00000001', 'タイトル揺れ'),
    row('three', 'vid00000002', '新しい動画'),
  ]);
  const before = JSON.stringify(cards);
  const [cast] = groupCardsByCast(cards);
  expect(cast.videos.map(v => v.id)).toEqual(['vid00000002', 'vid00000001']);
  expect(cast.videos[1].title).toBe('初出タイトル');
  expect(cast.wordCount).toBe(3);
  expect(cast.thumbnailUrl).toContain('vid00000002');
  expect(JSON.stringify(cards)).toBe(before);
});
