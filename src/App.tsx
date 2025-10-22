import { useState, useEffect } from 'react';
import './App.css';
import type { VocabCard, ProgressData, Progress, VideoGroup } from './types';
import {
  SAMPLE_DATA,
  DEFAULT_CSV_URL,
  PROGRESS_STORAGE_KEY,
  AUDIO_ENABLED_KEY
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

function App() {
  // 状態管理
  const [screen, setScreen] = useState<'gallery' | 'study'>('gallery');
  const [allVideos, setAllVideos] = useState<VideoGroup[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<VideoGroup | null>(null);
  const [cards, setCards] = useState<VocabCard[]>([]);
  const [currentCard, setCurrentCard] = useState<VocabCard | null>(null);
  const [isFlipped, setIsFlipped] = useState(false);
  const [progress, setProgress] = useState<ProgressData>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [todayCount, setTodayCount] = useState(0);
  const [showHelp, setShowHelp] = useState(false);
  const [showInstallBanner, setShowInstallBanner] = useState(false);

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

    // ヘッダー検証（6列または7列に対応、列順2パターン）
    const isValid6 = JSON.stringify(headers) === JSON.stringify(expectedHeaders6);
    const isValid7New = JSON.stringify(headers) === JSON.stringify(expectedHeaders7New);
    const isValid7Old = JSON.stringify(headers) === JSON.stringify(expectedHeaders7Old);
    const isNew7Format = isValid7New; // 新形式かどうかのフラグ

    if (!isValid6 && !isValid7New && !isValid7Old) {
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

      if (values.length !== 6 && values.length !== 7) {
        console.warn(`行 ${i + 1} をスキップ: 列数が不正です（期待: 6または7列、実際: ${values.length}列）`);
        continue;
      }

      // 列順に応じて値を割り当て
      let 単語, 和訳, 難易度, 品詞, 文脈, 動画URL, 動画タイトル;

      if (isNew7Format) {
        // 新形式: 単語,和訳,文脈,難易度,品詞,動画URL,動画タイトル
        [単語, 和訳, 文脈, 難易度, 品詞, 動画URL, 動画タイトル] = values;
      } else {
        // 旧形式: 単語,和訳,難易度,品詞,文脈,動画URL,[動画タイトル]
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
        動画タイトル: 動画タイトル || undefined  // 7列目がない場合はundefined
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

      // 動画URLごとにグループ化
      const videoGroups = groupCardsByVideo(parsedCards);
      setAllVideos(videoGroups);
      setCards(parsedCards);

      console.log('[CSV_LOAD]', {
        operation: 'loadCSV',
        status: 'success',
        cardCount: parsedCards.length,
        videoCount: videoGroups.length,
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

  // localStorage から進捗を読み込み
  const loadProgress = () => {
    const stored = localStorage.getItem(PROGRESS_STORAGE_KEY);
    if (stored) {
      try {
        setProgress(JSON.parse(stored));
      } catch {
        console.warn('進捗データの読み込みに失敗しました');
      }
    }

    const audioStored = localStorage.getItem(AUDIO_ENABLED_KEY);
    if (audioStored) {
      setAudioEnabled(audioStored === 'true');
    }
  };

  // 進捗を保存
  const saveProgress = (newProgress: ProgressData) => {
    localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(newProgress));
    setProgress(newProgress);
  };

  // スマートスケジューリング
  const selectNextCard = (allCards: VocabCard[], currentProgress: ProgressData): VocabCard => {
    // 1. 未学習カード（seen === 0）があればランダム選択
    const unseenCards = allCards.filter(card => {
      const p = currentProgress[card.単語];
      return !p || p.seen === 0;
    });

    if (unseenCards.length > 0) {
      const selected = unseenCards[Math.floor(Math.random() * unseenCards.length)];
      console.log('[CARD_SELECT]', {
        operation: 'selectNextCard',
        strategy: 'unseen',
        word: selected.単語,
        unseenCount: unseenCards.length,
        timestamp: new Date().toISOString()
      });
      return selected;
    }

    // 2. 全て学習済みの場合、スコア降順ソート
    const score = (word: string) => {
      const p = currentProgress[word] || { seen: 0, again: 0, ok: 0, easy: 0 };
      return p.seen * 1 + p.again * 3 - p.easy;
    };

    const sortedCards = [...allCards].sort((a, b) => score(b.単語) - score(a.単語));
    const selected = sortedCards[0];
    console.log('[CARD_SELECT]', {
      operation: 'selectNextCard',
      strategy: 'score',
      word: selected.単語,
      score: score(selected.単語),
      timestamp: new Date().toISOString()
    });
    return selected;
  };

  // 評価処理
  const handleRate = (type: 'again' | 'ok' | 'easy') => {
    if (!currentCard) return;

    const word = currentCard.単語;
    const currentP: Progress = progress[word] || { seen: 0, again: 0, ok: 0, easy: 0 };

    const newProgress = {
      ...progress,
      [word]: {
        seen: currentP.seen + 1,
        again: currentP.again + (type === 'again' ? 1 : 0),
        ok: currentP.ok + (type === 'ok' ? 1 : 0),
        easy: currentP.easy + (type === 'easy' ? 1 : 0)
      }
    };

    console.log('[CARD_RATE]', {
      operation: 'handleRate',
      word,
      rating: type,
      previousProgress: currentP,
      newProgress: newProgress[word],
      timestamp: new Date().toISOString()
    });

    saveProgress(newProgress);
    setTodayCount(prev => prev + 1);

    // 次のカードへ（フリップせずに即座に遷移）
    setIsFlipped(false);
    const nextCard = selectNextCard(cards, newProgress);
    setCurrentCard(nextCard);
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

  // 進捗リセット
  const handleReset = () => {
    if (confirm('進捗をリセットしてもよろしいですか？')) {
      localStorage.removeItem(PROGRESS_STORAGE_KEY);
      setProgress({});
      setTodayCount(0);
      if (cards.length > 0) {
        setCurrentCard(selectNextCard(cards, {}));
      }
    }
  };

  // 動画選択
  const handleSelectVideo = (video: VideoGroup) => {
    setSelectedVideo(video);
    setCards(video.cards);
    setScreen('study');
    setIsFlipped(false);
    setCurrentCard(null);
    setTodayCount(0);
    // 動画ごとの進捗を読み込み
    const videoProgress = localStorage.getItem(`vocab_progress_${video.id}`);
    if (videoProgress) {
      try {
        setProgress(JSON.parse(videoProgress));
      } catch {
        setProgress({});
      }
    } else {
      setProgress({});
    }
  };

  // 全ての動画を学習
  const handleSelectAll = () => {
    setSelectedVideo(null);
    setCards(allVideos.flatMap(v => v.cards));
    setScreen('study');
    setIsFlipped(false);
    setCurrentCard(null);
    setTodayCount(0);
    loadProgress();
  };

  // ギャラリーに戻る
  const handleBackToGallery = () => {
    setScreen('gallery');
    setSelectedVideo(null);
    setCurrentCard(null);
    setIsFlipped(false);
  };

  // インストールバナーを閉じる
  const handleDismissInstallBanner = () => {
    setShowInstallBanner(false);
    localStorage.setItem('install_banner_dismissed', 'true');
  };

  // 初期化
  useEffect(() => {
    loadProgress();
    loadCSV();

    // PWAインストールバナー表示（初回アクセス時のみ）
    const installBannerDismissed = localStorage.getItem('install_banner_dismissed');
    if (!installBannerDismissed) {
      setTimeout(() => setShowInstallBanner(true), 3000);
    }
  }, []);

  // カードが読み込まれたら最初のカードを選択
  useEffect(() => {
    if (cards.length > 0 && !currentCard) {
      setCurrentCard(selectNextCard(cards, progress));
    }
  }, [cards, currentCard, progress]);

  // 難易度に応じた色を取得
  const getLevelColor = (level: string): string => {
    switch (level) {
      case '初級': return 'var(--level-beginner)';
      case '中級': return 'var(--level-intermediate)';
      case '上級': return 'var(--level-advanced)';
      default: return '#888';
    }
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

  // ギャラリー画面
  if (screen === 'gallery' && allVideos.length > 0) {
    const totalWords = allVideos.reduce((sum, v) => sum + v.wordCount, 0);
    return (
      <div className="app">
        {/* ヘッダー */}
        <header className="header">
          <div className="header-left">
            <div className="logo">VL</div>
            <h1 className="app-name">Vlingual Cards</h1>
          </div>
          <div className="header-right">
            {'speechSynthesis' in window && (
              <button onClick={toggleAudio} className="icon-button" title="音声読み上げ">
                {audioEnabled ? '🔊' : '🔇'}
              </button>
            )}
            <button onClick={() => setShowHelp(true)} className="icon-button" title="使い方">
              ?
            </button>
          </div>
        </header>

        {/* ギャラリーコンテンツ */}
        <main className="gallery-container">
          <h2 className="gallery-title">📚 動画を選択してください</h2>

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
                </div>
              </div>
            ))}

            {/* 全ての動画カード */}
            {allVideos.length > 1 && (
              <div
                className="video-card video-card-all"
                onClick={handleSelectAll}
              >
                <div className="all-videos-icon">📚</div>
                <div className="video-info">
                  <h3 className="video-title">全ての動画</h3>
                  <p className="video-word-count">📖 {totalWords}語</p>
                  <p className="all-videos-subtitle">すべて学習</p>
                </div>
              </div>
            )}
          </div>
        </main>

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
                <h3>📊 スマートスケジューリング</h3>
                <p>学習効率を最大化するため、以下のルールで次のカードが選ばれます：</p>
                <ul>
                  <li><strong>未学習カード優先</strong>: まだ見ていないカードがあればランダムに表示</li>
                  <li><strong>スコア順復習</strong>: 全て学習済みなら、苦手なカードから復習</li>
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

              <section className="help-section">
                <h3>💡 ヒント</h3>
                <ul>
                  <li>動画ごとに進捗が個別に保存されます</li>
                  <li>「全ての動画」を選ぶと、すべての語彙をまとめて学習できます</li>
                  <li>進捗をリセットしたい場合は、画面下部の「進捗リセット」ボタンをタップ</li>
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
          {allVideos.length > 1 && (
            <button onClick={handleBackToGallery} className="back-button" title="動画選択に戻る">
              ←
            </button>
          )}
          <div className="logo">VL</div>
          <h1 className="app-name">
            {selectedVideo ? selectedVideo.title : 'Vlingual Cards'}
          </h1>
        </div>
        <div className="header-right">
          <span className="today-count">{todayCount}枚</span>
          {'speechSynthesis' in window && (
            <button onClick={toggleAudio} className="icon-button" title="音声読み上げ">
              {audioEnabled ? '🔊' : '🔇'}
            </button>
          )}
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
        {currentCard && (
          <>
            <div
              className={`card ${isFlipped ? 'flipped' : ''}`}
              onClick={handleFlip}
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
                <div className="card-word">{currentCard.単語}</div>
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
              >
                覚えてない
              </button>
              <button
                onClick={() => handleRate('ok')}
                className="btn-rating btn-ok"
              >
                だいたいOK
              </button>
              <button
                onClick={() => handleRate('easy')}
                className="btn-rating btn-easy"
              >
                余裕
              </button>
            </div>
          </>
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
              <h3>📊 スマートスケジューリング</h3>
              <p>学習効率を最大化するため、以下のルールで次のカードが選ばれます：</p>
              <ul>
                <li><strong>未学習カード優先</strong>: まだ見ていないカードがあればランダムに表示</li>
                <li><strong>スコア順復習</strong>: 全て学習済みなら、苦手なカードから復習</li>
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

            <section className="help-section">
              <h3>💡 ヒント</h3>
              <ul>
                <li>動画ごとに進捗が個別に保存されます</li>
                <li>「全ての動画」を選ぶと、すべての語彙をまとめて学習できます</li>
                <li>進捗をリセットしたい場合は、画面下部の「進捗リセット」ボタンをタップ</li>
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
