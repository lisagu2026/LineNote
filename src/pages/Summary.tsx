import React, {useEffect, useRef, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {
  createArticle,
  updateArticle,
  analyzeArticle,
  getSentenceTranslationsCached,
  summarizeArticleStream,
} from '../lib/api';
import {useStore, Article, Card} from '../store';
import {ChevronLeft, Download, ChevronDown, ChevronUp, Star, Save, Trash2} from 'lucide-react';

export default function Summary() {
  const navigate = useNavigate();
  const {
    articleTitle,
    articleText,
    activeArticleId,
    setActiveArticleId,
    articles,
    cards,
    highlights,
    removeHighlight,
    replaceHighlights,
    updateHighlight,
    saveToLibrary,
    clearHighlights,
    setArticle,
    summaryDraft,
    setSummaryDraft,
    clearSummaryDraft,
  } = useStore();

  const [isTranslationOpen, setIsTranslationOpen] = useState(true);
  const [showTranslation, setShowTranslation] = useState(true);
  const [learningPoints, setLearningPoints] = useState<string[]>([]);
  const [fullTranslationZh, setFullTranslationZh] = useState('');
  const [sentencePairs, setSentencePairs] = useState<Array<{source: string; translationZh: string}>>([]);
  const [analysisStatus, setAnalysisStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [analysisError, setAnalysisError] = useState('');
  const [analysisProgress, setAnalysisProgress] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [deleteCardId, setDeleteCardId] = useState<string | null>(null);
  const hasAnalyzedRef = useRef(false);
  const pollingTimerRef = useRef<number | null>(null);
  const canRegenerateSummary = Boolean(activeArticleId);

  useEffect(() => {
    if (hasAnalyzedRef.current) {
      return;
    }
    hasAnalyzedRef.current = true;

    if (!articleText.trim()) {
      setAnalysisStatus('error');
      setAnalysisError('当前没有可分析的文章内容');
      return;
    }
    const hasCachedDraft =
      summaryDraft &&
      summaryDraft.articleText === articleText;

    if (hasCachedDraft) {
      setLearningPoints(summaryDraft.learningPoints);
      setFullTranslationZh(summaryDraft.fullTranslationZh);
      setAnalysisStatus('success');
      void getSentenceTranslationsCached({content: articleText})
        .then((result) => {
          setSentencePairs(result.items);
          if (result.missingCount > 0) {
            scheduleSentencePolling(1);
          }
        })
        .catch(() => {
          setSentencePairs([]);
        });
      return;
    }

    void runAnalysis(false);
  }, [articleText]);

  useEffect(() => {
    return () => {
      if (pollingTimerRef.current) {
        window.clearTimeout(pollingTimerRef.current);
      }
    };
  }, []);

  async function runAnalysis(forceRegenerate: boolean) {
    setAnalysisStatus('loading');
    setAnalysisError('');
    setAnalysisProgress('');

    const sentencePromise = getSentenceTranslationsCached({content: articleText})
      .then((result) => {
        setSentencePairs(result.items);
        return result.missingCount;
      })
      .catch(() => {
        setSentencePairs([]);
        return 0;
      });

    try {
      const hasReadyCardDetails = highlights.every(
        (item) => item.translationZh && item.lemma && item.usageNote,
      );

      if (forceRegenerate || hasReadyCardDetails) {
        const summary = await summarizeArticleStream(
          {
            title: articleTitle || '未命名文章',
            content: articleText,
            force: forceRegenerate,
          },
          {
            onStatus: (status) => {
              setAnalysisProgress(status.message || '');
            },
          },
        );
        setLearningPoints(summary.learningPoints);
        setFullTranslationZh(summary.fullTranslationZh);
        setSummaryDraft({
          articleTitle: articleTitle || '未命名文章',
          articleText,
          learningPoints: summary.learningPoints,
          fullTranslationZh: summary.fullTranslationZh,
          learningPointEvidences: summary.learningPointEvidences ?? [],
        });
      } else {
        const requestHighlights = highlights.map((item) => ({...item}));
        const result = await analyzeArticle({
          title: articleTitle || '未命名文章',
          content: articleText,
          highlights: requestHighlights,
          force: forceRegenerate,
        });

        setLearningPoints(result.learningPoints);
        setFullTranslationZh(result.fullTranslationZh);
        setSummaryDraft({
          articleTitle: articleTitle || '未命名文章',
          articleText,
          learningPoints: result.learningPoints,
          fullTranslationZh: result.fullTranslationZh,
          learningPointEvidences: [],
        });
        const latestHighlights = useStore.getState().highlights;
        const requestIndexById = new Map(requestHighlights.map((item, index) => [item.id, index]));
        replaceHighlights(
          latestHighlights.map((highlight) => {
            const requestIndex = requestIndexById.get(highlight.id);
            if (requestIndex === undefined) {
              return highlight;
            }

            const aiCard = result.cards[requestIndex];
            if (!aiCard) {
              return highlight;
            }

            return {
              ...highlight,
              // Keep user-edited fields; only fill missing values from AI.
              translationZh: highlight.translationZh || aiCard.translationZh,
              lemma: highlight.lemma || aiCard.lemma,
              usageNote: highlight.usageNote || aiCard.usageNote,
              example: highlight.example || aiCard.example,
              note: highlight.note || aiCard.note,
              isImportant: highlight.isImportant,
            };
          }),
        );
      }

      const missingCount = await sentencePromise;
      if (missingCount > 0) {
        scheduleSentencePolling(1);
      }
      setAnalysisStatus('success');
      setAnalysisProgress('');
    } catch (error) {
      setAnalysisStatus('error');
      setAnalysisError(error instanceof Error ? error.message : '总结生成失败');
      setAnalysisProgress('');
    }
  }

  function handleRegenerateSummary() {
    const confirmed = window.confirm('确认重新生成总结吗？这会重新调用 AI，可能需要一些时间。');
    if (!confirmed) {
      return;
    }
    clearSummaryDraft();
    void runAnalysis(true);
  }

  function scheduleSentencePolling(round: number) {
    if (round > 6) {
      return;
    }

    pollingTimerRef.current = window.setTimeout(async () => {
      try {
        const result = await getSentenceTranslationsCached({content: articleText});
        setSentencePairs(result.items);
        if (result.missingCount > 0) {
          scheduleSentencePolling(round + 1);
        }
      } catch {
        scheduleSentencePolling(round + 1);
      }
    }, 1500);
  }

  async function handleSaveToLibrary() {
    if (analysisStatus !== 'success') {
      return;
    }

    setIsSaving(true);
    const articleId = activeArticleId || Date.now().toString();
    const existedArticle = activeArticleId ? articles.find((a) => a.id === activeArticleId) : null;
    const createdAt = existedArticle?.createdAt ?? Date.now();
    const newArticle: Article = {
      id: articleId,
      title: articleTitle || '未命名文章',
      content: articleText,
      learningPoints,
      fullTranslationZh,
      createdAt,
    };

    const currentHighlightIds = new Set(highlights.map((item) => item.id));
    const usedIds = new Set<string>(
      cards.map((card) => card.id).filter((id) => !currentHighlightIds.has(id)),
    );
    const newCards: Card[] = highlights.map((h, index) => {
      let nextId = h.id || `${articleId}-${index}`;
      while (usedIds.has(nextId)) {
        nextId = `${nextId}-${Math.random().toString(36).slice(2, 6)}`;
      }
      usedIds.add(nextId);

      return {
        ...h,
        id: nextId,
        articleId,
        createdAt,
      };
    });

    try {
      if (activeArticleId) {
        await updateArticle(activeArticleId, {
          ...newArticle,
          cards: newCards,
        });
      } else {
        await createArticle({
          ...newArticle,
          cards: newCards,
        });
      }

      saveToLibrary(newArticle, newCards);
      setActiveArticleId(articleId);
      clearSummaryDraft();
      clearHighlights();
      setArticle('', '');
      navigate('/library');
    } catch (error) {
      setAnalysisStatus('error');
      setAnalysisError(error instanceof Error ? error.message : '保存失败');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 font-sans pb-20">
      <header className="sticky top-0 z-10 bg-white border-b border-stone-200 px-4 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center space-x-2">
          <button onClick={() => navigate('/reader')} className="p-2 hover:bg-stone-100 rounded-full transition-colors">
            <ChevronLeft className="w-5 h-5 text-stone-600" />
          </button>
          <h1 className="text-base font-medium text-stone-800">学习总结</h1>
        </div>
        <div className="flex items-center space-x-2">
          <button
            disabled
            title="即将上线"
            className="bg-stone-100 text-stone-400 px-4 py-2 rounded-full text-sm font-medium hidden sm:flex items-center space-x-2 cursor-not-allowed"
          >
            <Download className="w-4 h-4" />
            <span>导出 PDF（即将上线）</span>
          </button>
          <button
            onClick={handleSaveToLibrary}
            disabled={analysisStatus !== 'success' || isSaving}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-stone-300 disabled:cursor-not-allowed text-white px-4 py-2 rounded-full text-sm font-medium transition-colors shadow-sm flex items-center space-x-2"
          >
            <Save className="w-4 h-4" />
            <span>{isSaving ? '保存中...' : '保存到知识库'}</span>
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        {analysisStatus === 'loading' && (
          <section className="bg-white rounded-2xl p-6 shadow-sm border border-stone-100">
            <p className="text-sm text-stone-500">
              {analysisProgress || 'AI 正在生成总结，请稍候...'}
            </p>
          </section>
        )}

        {analysisStatus === 'error' && (
          <section className="bg-red-50 rounded-2xl p-6 shadow-sm border border-red-100 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-red-700">总结生成失败</p>
              <p className="text-sm text-red-600 mt-1">{analysisError}</p>
            </div>
            <button
              onClick={() => void runAnalysis(true)}
              className="bg-white hover:bg-red-100 text-red-700 border border-red-200 px-4 py-2 rounded-xl text-sm font-medium transition-colors"
            >
              重试
            </button>
          </section>
        )}

        <section className="bg-white rounded-2xl p-6 shadow-sm border border-stone-100">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 font-bold text-sm">A</div>
              <h2 className="text-lg font-semibold text-stone-800">本篇学习提要</h2>
            </div>
            {canRegenerateSummary && (
              <button
                onClick={handleRegenerateSummary}
                className="text-xs bg-stone-100 hover:bg-stone-200 text-stone-700 px-3 py-1.5 rounded-full font-medium transition-colors"
              >
                重新生成总结
              </button>
            )}
          </div>
          <ul className="space-y-3">
            {(learningPoints.length ? learningPoints : ['等待生成学习提要...']).map((point, idx) => (
              <li key={idx} className="flex items-start space-x-3 text-stone-600 text-sm leading-relaxed">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-2 flex-shrink-0"></span>
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="bg-white rounded-2xl shadow-sm border border-stone-100 overflow-hidden">
          <button
            onClick={() => setIsTranslationOpen(!isTranslationOpen)}
            className="w-full px-6 py-4 flex items-center justify-between bg-stone-50 hover:bg-stone-100 transition-colors"
          >
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-sm">B</div>
              <h2 className="text-lg font-semibold text-stone-800">俄中对照</h2>
            </div>
            {isTranslationOpen ? <ChevronUp className="w-5 h-5 text-stone-500" /> : <ChevronDown className="w-5 h-5 text-stone-500" />}
          </button>

          {isTranslationOpen && (
            <div className="p-6 border-t border-stone-100 space-y-4">
              <label className="inline-flex items-center gap-2 text-sm text-stone-600">
                <input
                  type="checkbox"
                  checked={showTranslation}
                  onChange={(e) => setShowTranslation(e.target.checked)}
                  className="rounded border-stone-300 text-emerald-600 focus:ring-emerald-500"
                />
                显示翻译
              </label>
              <div className="space-y-3">
                {(sentencePairs.length ? sentencePairs : [{source: articleText || '', translationZh: fullTranslationZh}]).map((pair, idx) => (
                  <div key={`${idx}-${pair.source.slice(0, 8)}`} className="rounded-xl border border-stone-100 bg-stone-50 p-3">
                    <p className="text-stone-800 leading-relaxed text-sm font-serif">{pair.source}</p>
                    {showTranslation && (
                      <p className="text-stone-600 leading-relaxed text-sm mt-2">
                        {pair.translationZh || '...'}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <section>
          <div className="flex items-center space-x-2 mb-6 px-2">
            <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 font-bold text-sm">C</div>
            <h2 className="text-lg font-semibold text-stone-800">本篇卡片区 ({highlights.length})</h2>
          </div>

          {highlights.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center border border-stone-100 border-dashed">
              <p className="text-stone-500">暂无划线卡片，返回阅读页继续划线吧。</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {highlights.map((card) => (
                <div key={card.id} className={`bg-white rounded-2xl p-5 shadow-sm border transition-colors ${card.isImportant ? 'border-amber-300 ring-1 ring-amber-100' : 'border-stone-200'}`}>
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <p className="text-xs font-medium text-stone-400 uppercase tracking-wider mb-1">原文</p>
                      <h3 className="text-lg font-semibold text-stone-900 font-serif">{card.originalText}</h3>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => setDeleteCardId(card.id)}
                        className="p-2 rounded-full transition-colors bg-stone-100 text-stone-400 hover:bg-red-50 hover:text-red-500"
                        title="删除卡片"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => updateHighlight(card.id, {isImportant: !card.isImportant})}
                        className={`p-2 rounded-full transition-colors ${card.isImportant ? 'bg-amber-100 text-amber-500' : 'bg-stone-100 text-stone-400 hover:bg-stone-200'}`}
                      >
                        <Star className={`w-4 h-4 ${card.isImportant ? 'fill-current' : ''}`} />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-stone-500 mb-1">原型</label>
                      <input
                        type="text"
                        value={card.lemma}
                        onChange={(e) => updateHighlight(card.id, {lemma: e.target.value})}
                        placeholder="如: делать / сделать"
                        className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-stone-500 mb-1">中文</label>
                      <input
                        type="text"
                        value={card.translationZh}
                        onChange={(e) => updateHighlight(card.id, {translationZh: e.target.value})}
                        className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-stone-500 mb-1">核心用法</label>
                      <input
                        type="text"
                        value={card.usageNote}
                        onChange={(e) => updateHighlight(card.id, {usageNote: e.target.value})}
                        placeholder="一句话简明用法"
                        className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-stone-500 mb-1">例句</label>
                      <textarea
                        value={card.example}
                        onChange={(e) => updateHighlight(card.id, {example: e.target.value})}
                        placeholder="输入例句..."
                        rows={2}
                        className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all resize-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-stone-500 mb-1">备注</label>
                      <textarea
                        value={card.note}
                        onChange={(e) => updateHighlight(card.id, {note: e.target.value})}
                        placeholder="补充笔记..."
                        rows={2}
                        className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all resize-none"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {deleteCardId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-lg p-6 max-w-sm w-full">
            <h3 className="text-lg font-semibold text-stone-900 mb-2">确认删除</h3>
            <p className="text-stone-600 mb-6">确定要删除这张卡片吗？此操作无法恢复。</p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setDeleteCardId(null)}
                className="px-4 py-2 text-sm font-medium text-stone-600 hover:bg-stone-100 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={() => {
                  removeHighlight(deleteCardId);
                  setDeleteCardId(null);
                }}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
