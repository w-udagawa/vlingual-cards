import { useState, useEffect } from 'react';
import './App.css';
import type { VocabCard, VideoGroup, CastGroup } from './types';
import {
  SAMPLE_DATA,
  DEFAULT_CSV_URL,
  AUDIO_ENABLED_KEY,
  THEME_PREFERENCE_KEY,
  AGENCY_ORDER_KEY,
  VOCABULARY_CHECKED_KEY
} from './types';

// YouTube動画IDを抽出
function extractYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&?\/]+)/,
    /youtube\.com\/embed\/([^&?\/]+)/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// サムネイルURL生成
function getThumbnailUrl(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
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
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
      />
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
      {/* スピーカー本体 */}
      <path
        d="M11 5L6 9H2v6h4l5 4V5z"
        stroke="currentColor"
        strokeWidth="2"
        fill="currentColor"
        strokeLinejoin="round"
      />

      {enabled ? (
        // 音波（ON時）
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
        // スラッシュ線（OFF時）
        <path
          d="M3 3L21 21"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

function App() {
  // 状態管理
  const [screen, setScreen] = useState<'cast-list' | 'video-list' | 'study'>('cast-list');
  const [allCasts, setAllCasts] = useState<CastGroup[]>([]); // キャスト一覧
  const [allVideos, setAllVideos] = useState<VideoGroup[]>([]); // 選択されたキャストの動画一覧
  const [selectedCast, setSelectedCast] = useState<CastGroup | null>(null); // 選択されたキャスト
  const [selectedVideo, setSelectedVideo] = useState<VideoGroup | null>(null); // 選択された動画
  const [cards, setCards] = useState<VocabCard[]>([]);
  const [currentCard, setCurrentCard] = useState<VocabCard | null>(null);
  const [isFlipped, setIsFlipped] = useState(false);
  const [mastered, setMastered] = useState<Set<string>>(new Set()); // 「余裕」にした単語のSet（セッション管理）
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [showHelp, setShowHelp] = useState(false);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false); // カード切り替え中かどうか
  const [showVocabList, setShowVocabList] = useState(false); // 語彙一覧モーダルの表示状態
  const [vocabListSource, setVocabListSource] = useState<VideoGroup | null>(null); // 一覧表示する動画
  const [agencyOrder, setAgencyOrder] = useState<string[]>([]); // 事務所の並び順
  const [showAgencyOrderModal, setShowAgencyOrderModal] = useState(false); // 並び順変更モーダルの表示状態
  const [tempOrder, setTempOrder] = useState<string[]>([]); // 並び順変更モーダル用の一時的な並び順
  const [checkedVocab, setCheckedVocab] = useState<Map<string, Set<string>>>(new Map()); // 動画IDをキーに、チェックした単語のSetを保存
  const [vocabListFilter, setVocabListFilter] = useState<'all' | 'unchecked' | 'checked'>('all'); // 語彙一覧のフィルター状態

  // CSV解析関数
  const parseCSV = (csvText: string): VocabCard[] => {
    const lines = csvText.trim().split('\n');
    if (lines.length < 2) {
      throw new Error('CSVファイルが空です');
    }

    const headers = lines[0].split(',').map(h => h.trim().replace(/^\ufeff/, '')); // BOM除去
    const expectedHeaders6 = ['単語', '和訳', '難易度', '品詞', '文脈', '動画URL'];
    const expectedHeaders7New = ['単語', '和訳', '文脈', '難易度', '品詞', '動画URL', '動画タイトル']; // 新形式
    const expectedHeaders7Old = ['単語', '和訳', '難易度', '品詞', '文脈', '動画URL', '動画タイトル']; // 旧形式
    const expectedHeaders9New = ['単語', '和訳', '文脈', '難易度', '品詞', '動画URL', '動画タイトル', '事務所', 'キャスト名']; // 9列形式（新・キャスト対応）
    const expectedHeaders9Old = ['単語', '和訳', '難易度', '品詞', '文脈', '動画URL', '動画タイトル', '事務所', 'タレント']; // 9列形式（旧・キャスト対応）
    const expectedHeaders9OldAlt = ['単語', '和訳', '難易度', '品詞', '文脈', '動画URL', '動画タイトル', '事務所', 'キャスト名']; // 9列形式（旧・キャスト名表記）

    // ヘッダー検証（6列、7列、9列に対応）
    const isValid6 = JSON.stringify(headers) === JSON.stringify(expectedHeaders6);
    const isValid7New = JSON.stringify(headers) === JSON.stringify(expectedHeaders7New);
    const isValid7Old = JSON.stringify(headers) === JSON.stringify(expectedHeaders7Old);
    const isValid9New = JSON.stringify(headers) === JSON.stringify(expectedHeaders9New);
    const isValid9Old = JSON.stringify(headers) === JSON.stringify(expectedHeaders9Old);
    const isValid9OldAlt = JSON.stringify(headers) === JSON.stringify(expectedHeaders9OldAlt);
    const isNew7Format = isValid7New; // 新7列形式かどうか
    const isNew9Format = isValid9New; // 新9列形式かどうか
    const isOld9Format = isValid9Old || isValid9OldAlt; // 旧9列形式かどうか

    if (!isValid6 && !isValid7New && !isValid7Old && !isValid9New && !isValid9Old && !isValid9OldAlt) {
      throw new Error(`列名が想定と異なります（実際: ${headers.join(',')}）`);
    }

    const data: VocabCard[] = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // CSVのパース（ダブルクォートに対応）
      const values: string[] = [];
      let current = '';
      let inQuotes = false;

      for (let j = 0; j < line.length; j++) {
        const char = line[j];
        if (char === '"') {
          if (inQuotes && line[j + 1] === '"') {
            current += '"';
            j++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (char === ',' && !inQuotes) {
          values.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      values.push(current.trim());

      if (values.length !== 6 && values.length !== 7 && values.length !== 9) {
        console.warn(`行 ${i + 1} をスキップ: 列数が不正です（期待: 6, 7, または9列、実際: ${values.length}列）`);
        continue;
      }

      // 列順に応じて値を割り当て
      let 単語, 和訳, 難易度, 品詞, 文脈, 動画URL, 動画タイトル, 事務所, キャスト名;

      if (isNew9Format) {
        // 新9列形式: 単語,和訳,文脈,難易度,品詞,動画URL,動画タイトル,事務所,キャスト名
        [単語, 和訳, 文脈, 難易度, 品詞, 動画URL, 動画タイトル, 事務所, キャスト名] = values;
      } else if (isOld9Format) {
        // 旧9列形式: 単語,和訳,難易度,品詞,文脈,動画URL,動画タイトル,事務所,タレント（またはキャスト名）
        [単語, 和訳, 難易度, 品詞, 文脈, 動画URL, 動画タイトル, 事務所, キャスト名] = values;
      } else if (isNew7Format) {
        // 新7列形式: 単語,和訳,文脈,難易度,品詞,動画URL,動画タイトル
        [単語, 和訳, 文脈, 難易度, 品詞, 動画URL, 動画タイトル] = values;
      } else {
        // 旧6/7列形式: 単語,和訳,難易度,品詞,文脈,動画URL,[動画タイトル]
        [単語, 和訳, 難易度, 品詞, 文脈, 動画URL, 動画タイトル] = values;
      }

      if (難易度 !== '初級' && 難易度 !== '中級' && 難易度 !== '上級') {
        console.warn(`行 ${i + 1} をスキップ: 難易度が不正です（${難易度}）`);
        continue;
      }

      data.push({
        単語,
        和訳,
        難易度: 難易度 as '初級' | '中級' | '上級',
        品詞,
        文脈,
        動画URL,
        動画タイトル: 動画タイトル || undefined,  // 7列目がない場合はundefined
        事務所: 事務所 || undefined,             // 8列目（9列形式のみ）
        キャスト名: キャスト名 || undefined       // 9列目（9列形式のみ）
      });
    }

    if (data.length === 0) {
      throw new Error('有効なデータが見つかりませんでした');
    }

    return data;
  };

  // 動画ごとにカードをグループ化
  const groupCardsByVideo = (cards: VocabCard[]): VideoGroup[] => {
    const grouped = new Map<string, VideoGroup>();

    cards.forEach(card => {
      const videoId = extractYouTubeId(card.動画URL);
      if (!videoId) {
        console.warn('Invalid YouTube URL:', card.動画URL);
        return;
      }

      if (!grouped.has(videoId)) {
        grouped.set(videoId, {
          id: videoId,
          title: card.動画タイトル || `動画${grouped.size + 1}`,  // CSVからタイトル取得、なければフォールバック
          url: card.動画URL,
          thumbnailUrl: getThumbnailUrl(videoId),
          cards: [],
          wordCount: 0
        });
      }

      const group = grouped.get(videoId)!;
      group.cards.push(card);
      group.wordCount++;
    });

    return Array.from(grouped.values());
  };

  // キャスト名をURL用スラッグに変換
  const createCastSlug = (castName: string): string => {
    // URL安全な文字列に変換（日本語対応）
    return encodeURIComponent(castName);
  };

  // キャストごとにカードをグループ化
  const groupCardsByCast = (cards: VocabCard[]): CastGroup[] => {
    // まず動画ごとにグループ化
    const videoGroups = groupCardsByVideo(cards);

    // キャストごとに動画をグループ化
    const castMap = new Map<string, CastGroup>();

    videoGroups.forEach(videoGroup => {
      // この動画の最初のカードからキャスト情報を取得
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
          thumbnailUrl: videoGroup.thumbnailUrl // 最初の動画のサムネイル
        });
      }

      const castGroup = castMap.get(castId)!;
      castGroup.videos.push(videoGroup);
      castGroup.wordCount += videoGroup.wordCount;
    });

    // 事務所でソート（事務所名の昇順、未分類は最後）
    return Array.from(castMap.values()).sort((a, b) => {
      const agencyA = a.agency || 'ZZZZ未分類'; // 未分類を最後に
      const agencyB = b.agency || 'ZZZZ未分類';
      return agencyA.localeCompare(agencyB, 'ja');
    });
  };

  // CSV読み込み
  const loadCSV = async () => {
    const timestamp = new Date().toISOString();
    console.log('[CSV_LOAD]', {
      operation: 'loadCSV',
      url: DEFAULT_CSV_URL,
      status: 'start',
      timestamp
    });

    try {
      setLoading(true);
      setError(null);
      const response = await fetch(DEFAULT_CSV_URL);

      if (!response.ok) {
        throw new Error('CSVの取得に失敗しました');
      }

      const text = await response.text();
      const parsedCards = parseCSV(text);

      // キャストごとにグループ化（内部で動画ごとにもグループ化される）
      const castGroups = groupCardsByCast(parsedCards);
      setAllCasts(castGroups);
      setCards(parsedCards);

      console.log('[CSV_LOAD]', {
        operation: 'loadCSV',
        status: 'success',
        cardCount: parsedCards.length,
        castCount: castGroups.length,
        videoCount: castGroups.reduce((sum, cast) => sum + cast.videos.length, 0),
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      console.error('[CSV_LOAD]', {
        operation: 'loadCSV',
        status: 'error',
        error: err instanceof Error ? err.message : '不明なエラー',
        errorStack: err instanceof Error ? err.stack : undefined,
        fallback: 'SAMPLE_DATA',
        timestamp: new Date().toISOString()
      });
      setError(err instanceof Error ? err.message : '不明なエラーが発生しました');
      setCards(SAMPLE_DATA); // フォールバック
    } finally {
      setLoading(false);
    }
  };

  // 音声設定を読み込み
  const loadAudioSetting = () => {
    const audioStored = localStorage.getItem(AUDIO_ENABLED_KEY);
    if (audioStored) {
      setAudioEnabled(audioStored === 'true');
    }
  };

  // テーマ設定を読み込み
  const loadThemeSetting = () => {
    const savedTheme = localStorage.getItem(THEME_PREFERENCE_KEY);
    if (savedTheme === 'light' || savedTheme === 'dark') {
      setTheme(savedTheme);
    } else {
      // localStorageに設定がない場合、OS設定を自動検出
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      setTheme(prefersDark ? 'dark' : 'light');
    }
  };

  // 事務所の並び順を読み込み
  const loadAgencyOrder = () => {
    const savedOrder = localStorage.getItem(AGENCY_ORDER_KEY);
    if (savedOrder) {
      try {
        const parsed = JSON.parse(savedOrder);
        if (Array.isArray(parsed)) {
          setAgencyOrder(parsed);
        }
      } catch (e) {
        console.error('Failed to parse agency order:', e);
      }
    }
  };

  // 事務所の並び順を保存
  const saveAgencyOrder = (order: string[]) => {
    setAgencyOrder(order);
    localStorage.setItem(AGENCY_ORDER_KEY, JSON.stringify(order));
  };

  // チェック済み語彙を読み込み
  const loadCheckedVocab = () => {
    const saved = localStorage.getItem(VOCABULARY_CHECKED_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const map = new Map<string, Set<string>>();
        Object.keys(parsed).forEach(videoId => {
          map.set(videoId, new Set(parsed[videoId]));
        });
        setCheckedVocab(map);
      } catch (e) {
        console.error('Failed to parse checked vocabulary:', e);
      }
    }
  };

  // チェック済み語彙を保存
  const saveCheckedVocab = (map: Map<string, Set<string>>) => {
    const obj: Record<string, string[]> = {};
    map.forEach((wordSet, videoId) => {
      obj[videoId] = Array.from(wordSet);
    });
    localStorage.setItem(VOCABULARY_CHECKED_KEY, JSON.stringify(obj));
    setCheckedVocab(map);
  };

  // 語彙のチェック状態をトグル
  const toggleVocabCheck = (videoId: string, word: string) => {
    const newMap = new Map(checkedVocab);
    if (!newMap.has(videoId)) {
      newMap.set(videoId, new Set());
    }
    const wordSet = newMap.get(videoId)!;
    if (wordSet.has(word)) {
      wordSet.delete(word);
    } else {
      wordSet.add(word);
    }
    saveCheckedVocab(newMap);
  };

  // シンプルなカード選択（「余裕」以外からランダム）
  const selectNextCard = (allCards: VocabCard[], currentMastered: Set<string> = mastered): VocabCard | null => {
    // 「余裕」にしていないカードをフィルター
    const availableCards = allCards.filter(card => !currentMastered.has(card.単語));

    if (availableCards.length === 0) {
      return null; // 全て「余裕」になった
    }

    // ランダムに選択
    const selected = availableCards[Math.floor(Math.random() * availableCards.length)];
    console.log('[CARD_SELECT]', {
      operation: 'selectNextCard',
      word: selected.単語,
      remaining: availableCards.length,
      total: allCards.length,
      timestamp: new Date().toISOString()
    });
    return selected;
  };

  // 評価処理（スライドアニメーション対応版）
  const handleRate = (type: 'again' | 'ok' | 'easy') => {
    if (!currentCard || isTransitioning) return; // 遷移中は無視

    const word = currentCard.単語;

    // 「余裕」の場合のみ、masteredに追加
    if (type === 'easy') {
      const newMastered = new Set(mastered);
      newMastered.add(word);

      console.log('[CARD_RATE]', {
        operation: 'handleRate',
        word,
        rating: 'easy',
        mastered: true,
        remaining: cards.length - newMastered.size,
        timestamp: new Date().toISOString()
      });

      // スライドアニメーション開始
      setIsTransitioning(true);
      setIsFlipped(false); // フリップ状態をリセット

      // 450ms後に次のカードをセット（アニメーション400ms + 50msバッファ）
      setTimeout(() => {
        setMastered(newMastered);
        const nextCard = selectNextCard(cards, newMastered);
        setCurrentCard(nextCard);
        setIsTransitioning(false);
      }, 450);
    } else {
      console.log('[CARD_RATE]', {
        operation: 'handleRate',
        word,
        rating: type,
        mastered: false,
        timestamp: new Date().toISOString()
      });

      // スライドアニメーション開始
      setIsTransitioning(true);
      setIsFlipped(false); // フリップ状態をリセット

      // 450ms後に次のカードをセット（アニメーション400ms + 50msバッファ）
      setTimeout(() => {
        const nextCard = selectNextCard(cards);
        setCurrentCard(nextCard);
        setIsTransitioning(false);
      }, 450);
    }
  };

  // 音声読み上げ
  const speakWord = (word: string) => {
    if (!audioEnabled) return;
    if (!('speechSynthesis' in window)) return;

    const utterance = new SpeechSynthesisUtterance(word);
    utterance.lang = 'en-US';
    utterance.rate = 0.9;
    speechSynthesis.speak(utterance);
  };

  // カードフリップ
  const handleFlip = () => {
    if (!isFlipped && currentCard) {
      speakWord(currentCard.単語);
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

  // 進捗リセット（セッションリセット）
  const handleReset = () => {
    const message = 'この セッションの進捗をリセットしてもよろしいですか？\n（「余裕」にした単語が全て再表示されます）';

    if (confirm(message)) {
      const emptySet = new Set<string>();
      setMastered(emptySet); // 「余裕」リストをクリア

      if (cards.length > 0) {
        const nextCard = selectNextCard(cards, emptySet);
        setCurrentCard(nextCard);
      }
    }
  };

  // キャスト選択
  const handleSelectCast = (cast: CastGroup) => {
    setSelectedCast(cast);
    setAllVideos(cast.videos); // 選択されたキャストの動画一覧を設定
    setScreen('video-list');
    // URLパラメータを更新
    window.history.pushState({}, '', `?cast=${cast.id}`);
  };

  // 動画選択
  const handleSelectVideo = (video: VideoGroup) => {
    setSelectedVideo(video);
    setCards(video.cards);
    setScreen('study');
    setIsFlipped(false);
    setCurrentCard(null);
    setMastered(new Set()); // セッションリセット
    // URLパラメータを更新
    window.history.pushState({}, '', `?video=${video.id}`);
  };

  // 全ての動画を学習（キャスト一覧から）
  const handleSelectAllCasts = () => {
    setSelectedCast(null);
    setSelectedVideo(null);
    const allCards = allCasts.flatMap(cast => cast.videos.flatMap(v => v.cards));
    setCards(allCards);
    setScreen('study');
    setIsFlipped(false);
    setCurrentCard(null);
    setMastered(new Set()); // セッションリセット
  };

  // 全ての動画を学習（動画一覧から、キャスト内）
  const handleSelectAllVideos = () => {
    setSelectedVideo(null);
    setCards(allVideos.flatMap(v => v.cards));
    setScreen('study');
    setIsFlipped(false);
    setCurrentCard(null);
    setMastered(new Set()); // セッションリセット
  };

  // キャスト一覧に戻る
  const handleBackToCastList = () => {
    setScreen('cast-list');
    setSelectedCast(null);
    setSelectedVideo(null);
    setAllVideos([]);
    setCurrentCard(null);
    setIsFlipped(false);
    // URLパラメータをクリア
    window.history.pushState({}, '', window.location.pathname);
  };

  // 動画一覧に戻る
  const handleBackToVideoList = () => {
    setScreen('video-list');
    setSelectedVideo(null);
    setCurrentCard(null);
    setIsFlipped(false);
    // URLパラメータを更新（castのみ残す）
    if (selectedCast) {
      window.history.pushState({}, '', `?cast=${selectedCast.id}`);
    }
  };

  // インストールバナーを閉じる
  const handleDismissInstallBanner = () => {
    setShowInstallBanner(false);
    localStorage.setItem('install_banner_dismissed', 'true');
  };

  // 語彙一覧を開く（ギャラリーから）
  const handleOpenVocabListFromGallery = (video: VideoGroup, e: React.MouseEvent) => {
    e.stopPropagation(); // 動画選択をキャンセル
    setVocabListSource(video);
    setShowVocabList(true);
  };

  // 語彙一覧を開く（学習画面から）
  const handleOpenVocabListFromStudy = () => {
    if (selectedVideo) {
      setVocabListSource(selectedVideo);
    } else {
      // 「全ての動画」の場合
      setVocabListSource({
        id: 'all',
        title: '全ての動画',
        url: '',
        thumbnailUrl: '',
        cards: cards,
        wordCount: cards.length
      });
    }
    setShowVocabList(true);
  };

  // 語彙一覧を閉じる
  const handleCloseVocabList = () => {
    setShowVocabList(false);
    setVocabListSource(null);
  };

  // 並び順を上に移動
  const moveAgencyUp = (index: number) => {
    if (index === 0) return;
    const newOrder = [...tempOrder];
    [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
    setTempOrder(newOrder);
  };

  // 並び順を下に移動
  const moveAgencyDown = (index: number) => {
    if (index === tempOrder.length - 1) return;
    const newOrder = [...tempOrder];
    [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
    setTempOrder(newOrder);
  };

  // 並び順を保存
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
    loadAudioSetting();
    loadThemeSetting();
    loadAgencyOrder();
    loadCheckedVocab();
    loadCSV();

    // PWAインストールバナー表示（初回アクセス時のみ）
    const installBannerDismissed = localStorage.getItem('install_banner_dismissed');
    if (!installBannerDismissed) {
      setTimeout(() => setShowInstallBanner(true), 3000);
    }
  }, []);

  // URLパラメータ処理（キャスト・動画の直接アクセス）
  useEffect(() => {
    if (allCasts.length === 0) return;

    const params = new URLSearchParams(window.location.search);
    const castParam = params.get('cast');
    const videoParam = params.get('video');

    if (castParam) {
      // ?cast=xxx でキャスト選択
      const cast = allCasts.find(c => c.id === castParam);
      if (cast) {
        handleSelectCast(cast);
      }
    } else if (videoParam) {
      // ?video=xxx で動画選択
      const allVideos = allCasts.flatMap(c => c.videos);
      const video = allVideos.find(v => v.id === videoParam);
      if (video) {
        handleSelectVideo(video);
      }
    }

    // popstateイベント（戻る/進むボタン）のリスナー
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const castParam = params.get('cast');
      const videoParam = params.get('video');

      if (!castParam && !videoParam) {
        // パラメータなし → キャスト一覧に戻る
        handleBackToCastList();
      } else if (castParam && !videoParam) {
        // cast のみ → 動画一覧に戻る
        const cast = allCasts.find(c => c.id === castParam);
        if (cast) {
          handleSelectCast(cast);
        }
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [allCasts]);

  // カードが読み込まれたら最初のカードを選択
  useEffect(() => {
    if (cards.length > 0 && !currentCard) {
      const nextCard = selectNextCard(cards, mastered);
      setCurrentCard(nextCard);
    }
  }, [cards, currentCard, mastered]);

  // 並び順モーダルが開いたときにtempOrderを初期化
  useEffect(() => {
    if (showAgencyOrderModal && allCasts.length > 0) {
      // 事務所ごとにグループ化
      const agencies = new Map<string, CastGroup[]>();
      allCasts.forEach(cast => {
        const agencyName = cast.agency || '未分類';
        if (!agencies.has(agencyName)) {
          agencies.set(agencyName, []);
        }
        agencies.get(agencyName)!.push(cast);
      });

      // 現在の並び順を取得（stateまたはデフォルト）
      const currentOrder = agencyOrder.length > 0
        ? agencyOrder.filter(name => agencies.has(name))
        : Array.from(agencies.keys()).sort((a, b) => a.localeCompare(b, 'ja'));

      // 設定にない事務所を追加
      const allAgencyNames = Array.from(agencies.keys());
      const missingAgencies = allAgencyNames.filter(name => !currentOrder.includes(name));
      const fullOrder = [...currentOrder, ...missingAgencies.sort((a, b) => a.localeCompare(b, 'ja'))];

      setTempOrder(fullOrder);
    }
  }, [showAgencyOrderModal, allCasts, agencyOrder]);

  // 難易度に応じた色を取得
  const getLevelColor = (level: string): string => {
    switch (level) {
      case '初級': return 'var(--level-beginner)';
      case '中級': return 'var(--level-intermediate)';
      case '上級': return 'var(--level-advanced)';
      default: return '#888';
    }
  };

  // 語彙一覧モーダルコンポーネント
  const VocabListModal = () => {
    if (!showVocabList || !vocabListSource) return null;

    // ESCキーでモーダルを閉じる
    useEffect(() => {
      const handleEsc = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          handleCloseVocabList();
        }
      };
      document.addEventListener('keydown', handleEsc);
      return () => document.removeEventListener('keydown', handleEsc);
    }, []);

    // フィルター適用
    const videoId = vocabListSource.id;
    const checkedWords = checkedVocab.get(videoId) || new Set<string>();

    const filteredCards = vocabListSource.cards.filter(card => {
      const isChecked = checkedWords.has(card.単語);
      if (vocabListFilter === 'checked') return isChecked;
      if (vocabListFilter === 'unchecked') return !isChecked;
      return true; // 'all'
    });

    return (
      <div className="vocab-list-modal-overlay" onClick={handleCloseVocabList}>
        <div className="vocab-list-modal-content" onClick={(e) => e.stopPropagation()}>
          {/* ヘッダー */}
          <div className="vocab-list-header">
            <h2>📋 語彙一覧</h2>
            <button className="vocab-list-close" onClick={handleCloseVocabList}>
              ×
            </button>
          </div>

          {/* フィルターボタン */}
          <div className="vocab-filter-buttons">
            <button
              className={`vocab-filter-btn ${vocabListFilter === 'all' ? 'active' : ''}`}
              onClick={() => setVocabListFilter('all')}
            >
              全て ({vocabListSource.cards.length})
            </button>
            <button
              className={`vocab-filter-btn ${vocabListFilter === 'unchecked' ? 'active' : ''}`}
              onClick={() => setVocabListFilter('unchecked')}
            >
              未チェック ({vocabListSource.cards.length - checkedWords.size})
            </button>
            <button
              className={`vocab-filter-btn ${vocabListFilter === 'checked' ? 'active' : ''}`}
              onClick={() => setVocabListFilter('checked')}
            >
              チェック済み ({checkedWords.size})
            </button>
          </div>

          {/* テーブル */}
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
                {filteredCards.map((card, index) => {
                  const isChecked = checkedWords.has(card.単語);
                  return (
                    <tr key={index} className={isChecked ? 'vocab-checked' : ''}>
                      <td className="vocab-checkbox-col">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleVocabCheck(videoId, card.単語)}
                          className="vocab-checkbox"
                        />
                      </td>
                      <td className="vocab-word">{card.単語}</td>
                      <td className="vocab-translation">{card.和訳}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

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

  // エラー画面
  if (error && cards.length === 0) {
    return (
      <div className="app">
        <div className="error-screen">
          <div className="error-icon">⚠️</div>
          <h2>読み込みに失敗しました</h2>
          <p className="error-message">{error}</p>
          <div className="error-buttons">
            <button onClick={loadCSV} className="btn-retry">再試行</button>
            <button onClick={() => { setError(null); setCards(SAMPLE_DATA); }} className="btn-sample">
              サンプルで試す
            </button>
          </div>
        </div>
      </div>
    );
  }

  // キャスト一覧画面
  if (screen === 'cast-list' && allCasts.length > 0) {
    const totalWords = allCasts.reduce((sum, cast) => sum + cast.wordCount, 0);

    // 事務所ごとにグループ化
    const agencies = new Map<string, CastGroup[]>();
    allCasts.forEach(cast => {
      const agencyName = cast.agency || '未分類';
      if (!agencies.has(agencyName)) {
        agencies.set(agencyName, []);
      }
      agencies.get(agencyName)!.push(cast);
    });

    // 事務所の並び順を決定（ユーザー設定 → デフォルト順）
    const agencyNames = Array.from(agencies.keys());
    const sortedAgencies = agencyOrder.length > 0
      ? [
          // ユーザー設定の順序で並べる
          ...agencyOrder.filter(name => agencies.has(name)),
          // 設定にない事務所はアルファベット順で最後に追加
          ...agencyNames.filter(name => !agencyOrder.includes(name)).sort((a, b) => a.localeCompare(b, 'ja'))
        ]
      : agencyNames.sort((a, b) => a.localeCompare(b, 'ja')); // デフォルトはアルファベット順

    return (
      <div className="app">
        {/* ヘッダー */}
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
          </div>
        </header>

        {/* キャスト一覧コンテンツ */}
        <main className="gallery-container">
          <h2 className="gallery-title">📚 動画一覧</h2>

          {/* 事務所ごとにセクション分け */}
          {sortedAgencies.map((agencyName) => {
            const casts = agencies.get(agencyName)!;
            return (
              <div key={agencyName} className="agency-section">
                <h3 className="agency-name">{agencyName}</h3>
                <div className="video-grid">
                  {casts.map(cast => (
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
                      </p>
                    </div>
                  </div>
                  ))}
                </div>
              </div>
            );
          })}

          {/* 全ての動画カード */}
          {allCasts.length > 1 && (
            <div className="video-grid" style={{ marginTop: '2rem' }}>
              <div
                className="video-card video-card-all"
                onClick={handleSelectAllCasts}
              >
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

        {/* ヘルプモーダル */}
        {showHelp && (
          <div className="help-modal-overlay" onClick={() => setShowHelp(false)}>
            <div className="help-modal-content" onClick={(e) => e.stopPropagation()}>
              <button className="help-modal-close" onClick={() => setShowHelp(false)}>
                ×
              </button>
              <h2>📖 使い方</h2>

              <section className="help-section">
                <h3>🎤 キャスト選択</h3>
                <ol>
                  <li><strong>キャストを選択</strong>: 好きなVtuberキャストをタップして動画一覧へ</li>
                  <li><strong>動画を選択</strong>: 学習したい動画をタップ</li>
                  <li><strong>学習開始</strong>: カードをめくって英単語を学習</li>
                </ol>
              </section>

              <section className="help-section">
                <h3>🎯 基本的な使い方</h3>
                <ol>
                  <li><strong>カードをタップ</strong>: 表面（英単語）をタップして裏面（和訳と例文）を確認</li>
                  <li><strong>3段階で評価</strong>:
                    <ul>
                      <li>🔴 <strong>覚えてない</strong>: もう一度このカードが出てきます</li>
                      <li>🟡 <strong>だいたいOK</strong>: もう一度このカードが出てきます</li>
                      <li>🟢 <strong>余裕</strong>: このカードは今回の学習ではもう出ません</li>
                    </ul>
                  </li>
                  <li><strong>ゴール</strong>: 全ての単語を「余裕」にすることが目標です！</li>
                </ol>
              </section>

              <section className="help-section">
                <h3>💡 セッション管理</h3>
                <p><strong>記録は学習中のみ保持されます</strong>：</p>
                <ul>
                  <li>✅ 学習中は「余裕」にした単語が記憶されます</li>
                  <li>🔄 ページを閉じる/リロードすると記録がリセットされます</li>
                  <li>🎯 <strong>1つの動画を「やり切る」学習スタイル</strong>です</li>
                </ul>
              </section>

              <button className="help-modal-button" onClick={() => setShowHelp(false)}>
                閉じる
              </button>
            </div>
          </div>
        )}

        {/* インストールバナー */}
        {showInstallBanner && (
          <div className="install-banner">
            <div className="install-banner-content">
              <span className="install-banner-text">
                📲 ホーム画面に追加してアプリのように使えます！
              </span>
              <button onClick={handleDismissInstallBanner} className="install-banner-close">
                ✕
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // 動画一覧画面
  if (screen === 'video-list' && allVideos.length > 0) {
    const totalWords = allVideos.reduce((sum, v) => sum + v.wordCount, 0);
    return (
      <div className="app">
        {/* ヘッダー */}
        <header className="header">
          <div className="header-left">
            {selectedCast && (
              <button onClick={handleBackToCastList} className="back-button" title="キャスト選択に戻る">
                ←
              </button>
            )}
            <img src="/channel-logo.jpg" alt="Vlingual Channel" className="logo" />
            <h1 className="app-name">{selectedCast ? selectedCast.name : 'Vlingual Cards'}</h1>
          </div>
          <div className="header-right">
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
          </div>
        </header>

        {/* ギャラリーコンテンツ */}
        <main className="gallery-container">
          <div className="video-grid">
            {allVideos.map(video => (
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
                  <p className="video-word-count">📖 {video.wordCount}語</p>
                  <button
                    className="btn-vocab-list"
                    onClick={(e) => handleOpenVocabListFromGallery(video, e)}
                  >
                    📋 一覧を見る
                  </button>
                </div>
              </div>
            ))}

            {/* 全ての動画カード */}
            {allVideos.length > 1 && (
              <div
                className="video-card video-card-all"
                onClick={handleSelectAllVideos}
              >
                <div className="all-videos-icon">📚</div>
                <div className="video-info">
                  <h3 className="video-title">全ての動画</h3>
                  <p className="video-word-count">📖 {totalWords}語</p>
                  <p className="all-videos-subtitle">すべて学習</p>
                  <button
                    className="btn-vocab-list"
                    onClick={(e) => {
                      e.stopPropagation();
                      setVocabListSource({
                        id: 'all',
                        title: '全ての動画',
                        url: '',
                        thumbnailUrl: '',
                        cards: allVideos.flatMap(v => v.cards),
                        wordCount: totalWords
                      });
                      setShowVocabList(true);
                    }}
                  >
                    📋 一覧を見る
                  </button>
                </div>
              </div>
            )}
          </div>
        </main>

        {/* 語彙一覧モーダル */}
        <VocabListModal />

        {/* ヘルプモーダル */}
        {showHelp && (
          <div className="help-modal-overlay" onClick={() => setShowHelp(false)}>
            <div className="help-modal-content" onClick={(e) => e.stopPropagation()}>
              <button className="help-modal-close" onClick={() => setShowHelp(false)}>
                ×
              </button>
              <h2>📖 使い方</h2>

              <section className="help-section">
                <h3>🎯 基本的な使い方</h3>
                <ol>
                  <li><strong>動画を選択</strong>: ギャラリーから学習したい動画をタップ</li>
                  <li><strong>カードをタップ</strong>: 表面（英単語）をタップして裏面（和訳と例文）を確認</li>
                  <li><strong>3段階で評価</strong>:
                    <ul>
                      <li>🔴 <strong>覚えてない</strong>: もう一度このカードが出てきます</li>
                      <li>🟡 <strong>だいたいOK</strong>: もう一度このカードが出てきます</li>
                      <li>🟢 <strong>余裕</strong>: このカードは **今回の学習では** もう出ません</li>
                    </ul>
                  </li>
                  <li><strong>ゴール</strong>: 全ての単語を「余裕」にすることが目標です！</li>
                </ol>
              </section>

              <section className="help-section">
                <h3>📊 進捗表示</h3>
                <p>画面上部に「残り○/○枚」と表示されます。「余裕」にした単語の数が減っていきます。全て「余裕」にすると完了です！</p>
              </section>

              <section className="help-section">
                <h3>🎵 音声読み上げ</h3>
                <p>ヘッダーの🔊/🔇ボタンで音声読み上げをON/OFFできます。ONにすると、カードをめくった時に英単語が読み上げられます。</p>
              </section>

              <section className="help-section">
                <h3>💡 セッション管理</h3>
                <p><strong>記録は学習中のみ保持されます</strong>：</p>
                <ul>
                  <li>✅ 学習中は「余裕」にした単語が記憶されます</li>
                  <li>🔄 ページを閉じる/リロードすると記録がリセットされます</li>
                  <li>🎯 <strong>1つの動画を「やり切る」学習スタイル</strong>です</li>
                  <li>📱 集中して全単語を「余裕」にすることを目指しましょう！</li>
                </ul>
              </section>

              <section className="help-section">
                <h3>🔄 進捗リセット</h3>
                <p>画面下部の「進捗リセット」ボタンで、今回の学習をリセットして最初からやり直せます。「余裕」にした単語が全て再表示されます。</p>
              </section>

              <section className="help-section">
                <h3>📲 ホーム画面に追加</h3>
                <p>アプリのように使えます：</p>
                <ul>
                  <li><strong>iPhone/iPad</strong>: Safari で共有ボタン → 「ホーム画面に追加」</li>
                  <li><strong>Android</strong>: Chrome で「ホーム画面に追加」をタップ</li>
                </ul>
              </section>

              <button className="help-modal-button" onClick={() => setShowHelp(false)}>
                閉じる
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // 学習画面
  return (
    <div className="app">
      {/* ヘッダー */}
      <header className="header">
        <div className="header-left">
          {selectedCast && (
            <button onClick={handleBackToVideoList} className="back-button" title="動画選択に戻る">
              ←
            </button>
          )}
          <img src="/channel-logo.jpg" alt="Vlingual Channel" className="logo" />
          <h1 className="app-name">
            {selectedVideo ? selectedVideo.title : 'Vlingual Cards'}
          </h1>
        </div>
        <div className="header-right">
          <span className="today-count">残り {cards.length - mastered.size}/{cards.length}枚</span>
          <button onClick={handleOpenVocabListFromStudy} className="icon-button" title="語彙一覧">
            📋
          </button>
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
        </div>
      </header>

      {/* エラーバナー（サンプルデータ使用時） */}
      {error && cards === SAMPLE_DATA && (
        <div className="warning-banner">
          ⚠️ CSVの読み込みに失敗しました。サンプルデータを表示しています。
          <button onClick={loadCSV} className="btn-link">再試行</button>
        </div>
      )}

      {/* カードコンテナ */}
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
                <div className="card-context">
                  {currentCard.文脈}
                </div>
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
            <h2>完了！</h2>
            <p>この動画の全ての単語を「余裕」にしました！</p>
            <button onClick={handleReset} className="btn-retry">
              もう一度学習する
            </button>
          </div>
        )}
      </main>

      {/* フッター */}
      <footer className="footer">
        <button onClick={handleReset} className="btn-reset">
          進捗リセット
        </button>
      </footer>

      {/* PWAインストールバナー */}
      {showInstallBanner && (
        <div className="install-banner">
          <button className="install-banner-close" onClick={handleDismissInstallBanner}>
            ×
          </button>
          <div className="install-banner-icon">📲</div>
          <div className="install-banner-content">
            <h3>ホーム画面に追加できます</h3>
            <p className="install-banner-subtitle">アプリのように使えます</p>
            <div className="install-banner-steps">
              <div className="install-step">
                <strong>iPhone/iPad:</strong> Safari の共有ボタン → 「ホーム画面に追加」
              </div>
              <div className="install-step">
                <strong>Android:</strong> Chrome のメニュー → 「ホーム画面に追加」
              </div>
            </div>
            <button className="install-banner-button" onClick={handleDismissInstallBanner}>
              後で
            </button>
          </div>
        </div>
      )}

      {/* 語彙一覧モーダル */}
      <VocabListModal />

      {/* ヘルプモーダル */}
      {showHelp && (
        <div className="help-modal-overlay" onClick={() => setShowHelp(false)}>
          <div className="help-modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="help-modal-close" onClick={() => setShowHelp(false)}>
              ×
            </button>
            <h2>📖 使い方</h2>

            <section className="help-section">
              <h3>🎯 基本的な使い方</h3>
              <ol>
                <li><strong>動画を選択</strong>: ギャラリーから学習したい動画をタップ</li>
                <li><strong>カードをタップ</strong>: 表面（英単語）をタップして裏面（和訳と例文）を確認</li>
                <li><strong>3段階で評価</strong>:
                  <ul>
                    <li>🔴 <strong>覚えてない</strong>: もっと復習が必要</li>
                    <li>🟡 <strong>だいたいOK</strong>: ある程度わかった</li>
                    <li>🟢 <strong>余裕</strong>: 完璧に覚えている</li>
                  </ul>
                </li>
              </ol>
            </section>

            <section className="help-section">
              <h3>🎵 音声読み上げ</h3>
              <p>ヘッダーの🔊/🔇ボタンで音声読み上げをON/OFFできます。ONにすると、カードをめくった時に英単語が読み上げられます。</p>
            </section>

            <section className="help-section">
              <h3>🔍 フィルター機能</h3>
              <p>ヘッダーのフィルターボタンで表示を切り替えられます：</p>
              <ul>
                <li><strong>📚 全て</strong>: 全ての単語を学習</li>
                <li><strong>🔴 覚えてない</strong>: 「覚えてない」と評価した単語のみ集中復習</li>
              </ul>
            </section>

            <section className="help-section">
              <h3>📊 スマートスケジューリング</h3>
              <p>学習効率を最大化するため、以下のルールで次のカードが選ばれます：</p>
              <ul>
                <li><strong>未学習カード優先</strong>: まだ見ていないカードがあればランダムに表示</li>
                <li><strong>重み付き復習</strong>: 全て学習済みなら、苦手なカード（「覚えてない」が多い）ほど出やすくなります</li>
              </ul>
            </section>

            <section className="help-section">
              <h3>💾 学習記録について</h3>
              <p><strong>記録はブラウザに保存されます</strong>：</p>
              <ul>
                <li>✅ ブラウザを閉じても記録は保持されます</li>
                <li>✅ 数日後・数週間後も記録は残ります</li>
                <li>⚠️ ブラウザのキャッシュクリアで消えます</li>
                <li>⚠️ 異なるブラウザ・デバイスでは記録は共有されません</li>
                <li>📱 同じブラウザを使い続ける限り、記録は永続的に保持されます</li>
              </ul>
            </section>

            <section className="help-section">
              <h3>🔄 進捗リセット</h3>
              <p>画面下部の「進捗リセット」ボタンで学習記録をリセットできます：</p>
              <ul>
                <li><strong>動画選択時</strong>: その動画の進捗のみリセット</li>
                <li><strong>「全ての動画」選択時</strong>: 全動画の進捗をリセット</li>
              </ul>
            </section>

            <section className="help-section">
              <h3>📲 ホーム画面に追加</h3>
              <p>アプリのように使えます：</p>
              <ul>
                <li><strong>iPhone/iPad</strong>: Safari で共有ボタン → 「ホーム画面に追加」</li>
                <li><strong>Android</strong>: Chrome で「ホーム画面に追加」をタップ</li>
              </ul>
            </section>

            <button className="help-modal-button" onClick={() => setShowHelp(false)}>
              閉じる
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
