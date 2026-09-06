import type { VocabCard, VideoGroup, CastGroup } from '../types';

// サムネイルURL生成（APIキー不要のYouTube CDN直参照）
function getThumbnailUrl(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
}

// 動画ごとにカードをグループ化（CSV出現順。動画タイトルはvideoId初出行を正とする）
// CSVは追記運用なので、後ろの行ほど新しいクリップ = この配列の後ろほど新しい
export function groupCardsByVideo(cards: VocabCard[]): VideoGroup[] {
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
export function groupCardsByCast(cards: VocabCard[]): CastGroup[] {
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

  // クリップは新しい順（CSV出現順の逆）に並べ、代表サムネイルも最新クリップに合わせる。
  // キャストの並び順自体はCSV初出順のまま（クリップの並び替えに引きずらせない）
  castMap.forEach(castGroup => {
    castGroup.videos.reverse();
    if (castGroup.videos[0]) {
      castGroup.thumbnailUrl = castGroup.videos[0].thumbnailUrl;
    }
  });

  return Array.from(castMap.values()).sort((a, b) => {
    const agencyA = a.agency || 'ZZZZ未分類';
    const agencyB = b.agency || 'ZZZZ未分類';
    return agencyA.localeCompare(agencyB, 'ja');
  });
}

