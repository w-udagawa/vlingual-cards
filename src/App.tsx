import { useState, useEffect } from 'react';
import './App.css';
import type { VocabCard, ProgressData, Progress } from './types';
import {
  SAMPLE_DATA,
  DEFAULT_CSV_URL,
  PROGRESS_STORAGE_KEY,
  AUDIO_ENABLED_KEY
} from './types';

function App() {
  // 状態管理
  const [cards, setCards] = useState<VocabCard[]>([]);
  const [currentCard, setCurrentCard] = useState<VocabCard | null>(null);
  const [isFlipped, setIsFlipped] = useState(false);
  const [progress, setProgress] = useState<ProgressData>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [todayCount, setTodayCount] = useState(0);

  // CSV解析関数
  const parseCSV = (csvText: string): VocabCard[] => {
    const lines = csvText.trim().split('\n');
    if (lines.length < 2) {
      throw new Error('CSVファイルが空です');
    }

    const headers = lines[0].split(',').map(h => h.trim());
    const expectedHeaders = ['単語', '和訳', '難易度', '品詞', '文脈', '動画URL'];

    // ヘッダー検証
    if (JSON.stringify(headers) !== JSON.stringify(expectedHeaders)) {
      throw new Error('列名が想定と異なります');
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

      if (values.length !== 6) {
        console.warn(`行 ${i + 1} をスキップ: 列数が不正です`);
        continue;
      }

      const [単語, 和訳, 難易度, 品詞, 文脈, 動画URL] = values;

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
        動画URL
      });
    }

    if (data.length === 0) {
      throw new Error('有効なデータが見つかりませんでした');
    }

    return data;
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
      setCards(parsedCards);

      console.log('[CSV_LOAD]', {
        operation: 'loadCSV',
        status: 'success',
        cardCount: parsedCards.length,
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

  // 初期化
  useEffect(() => {
    loadProgress();
    loadCSV();
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

  return (
    <div className="app">
      {/* ヘッダー */}
      <header className="header">
        <div className="header-left">
          <div className="logo">VL</div>
          <h1 className="app-name">Vlingual Cards</h1>
        </div>
        <div className="header-right">
          <span className="today-count">{todayCount}枚</span>
          {'speechSynthesis' in window && (
            <button onClick={toggleAudio} className="icon-button" title="音声読み上げ">
              {audioEnabled ? '🔊' : '🔇'}
            </button>
          )}
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
    </div>
  );
}

export default App;
