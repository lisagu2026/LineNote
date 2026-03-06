import React, {useEffect, useRef, useState} from 'react';
import {useNavigate, useParams} from 'react-router-dom';
import {
  type ApiCard,
  deleteCard as deleteCardRequest,
  getArticle,
  getSentenceTranslations,
  updateCard as updateCardRequest,
} from '../lib/api';
import {useStore} from '../store';
import {ChevronLeft, Download, ChevronDown, ChevronUp, Star, Trash2} from 'lucide-react';

export default function ArticleDetail() {
  const {id} = useParams<{id: string}>();
  const navigate = useNavigate();
  const {articles, cards, updateCard, removeCard, setArticle, replaceHighlights, setActiveArticleId, setSummaryDraft} = useStore();
  const [deleteCardId, setDeleteCardId] = useState<string | null>(null);
  const [sentencePairs, setSentencePairs] = useState<Array<{source: string; translationZh: string}>>([]);
  const [showTranslation, setShowTranslation] = useState(true);
  const [selectedSummaryVersionId, setSelectedSummaryVersionId] = useState<string | null>(null);
  const [remoteArticle, setRemoteArticle] = useState<(typeof articles)[number] | null>(null);
  const [remoteCards, setRemoteCards] = useState<typeof cards>([]);
  const [loadingRemote, setLoadingRemote] = useState(false);
  const [detailError, setDetailError] = useState('');
  const pendingCardUpdatesRef = useRef<Record<string, Partial<ApiCard>>>({});
  const saveTimersRef = useRef<Record<string, number>>({});

  const article = articles.find((a) => a.id === id);
  const articleCards = cards
    .filter((c) => c.articleId === id)
    .sort((a, b) => Number(b.isImportant) - Number(a.isImportant));
  const activeArticle = article ?? remoteArticle;
  const activeCards = article ? articleCards : [...remoteCards].sort((a, b) => Number(b.isImportant) - Number(a.isImportant));
  const summaryVersions = activeArticle?.summaryVersions?.length
    ? activeArticle.summaryVersions
    : activeArticle
      ? [{
          id: `saved-${activeArticle.id}-v1`,
          label: '版本 1',
          learningPoints: activeArticle.learningPoints,
          fullTranslationZh: activeArticle.fullTranslationZh,
          learningPointEvidences: [],
        }]
      : [];
  const currentSummaryVersion =
    summaryVersions.find((item) => item.id === selectedSummaryVersionId) ??
    summaryVersions[summaryVersions.length - 1] ??
    null;
  const displayedLearningPoints = currentSummaryVersion?.learningPoints ?? activeArticle?.learningPoints ?? [];

  const [isTranslationOpen, setIsTranslationOpen] = useState(true);
  const [isPointsOpen, setIsPointsOpen] = useState(true);

  function handleContinueReading() {
    if (!activeArticle) return;
    const sessionHighlights = activeCards
      .map((card) => ({
        id: card.id,
        originalText: card.originalText,
        isImportant: card.isImportant,
        lemma: card.lemma,
        translationZh: card.translationZh,
        usageNote: card.usageNote,
        example: card.example,
        note: card.note,
        start: card.start,
        end: card.end,
      }));
    setArticle(activeArticle.title, activeArticle.content);
    setActiveArticleId(activeArticle.id);
    setSummaryDraft({
      articleTitle: activeArticle.title,
      articleText: activeArticle.content,
      learningPoints: activeArticle.learningPoints,
      fullTranslationZh: activeArticle.fullTranslationZh,
      summaryVersions,
      selectedSummaryVersionId:
        selectedSummaryVersionId ||
        activeArticle.selectedSummaryVersionId ||
        summaryVersions[summaryVersions.length - 1]?.id ||
        `saved-${activeArticle.id}-v1`,
    });
    replaceHighlights(sessionHighlights);
    navigate('/reader?resume=1');
  }

  useEffect(() => {
    if (!id || article) {
      return;
    }

    setLoadingRemote(true);
    void getArticle(id)
      .then((result) => {
        setRemoteArticle({
          id: result.id,
          title: result.title,
          content: result.content,
          learningPoints: result.learningPoints,
          fullTranslationZh: result.fullTranslationZh,
          summaryVersions: result.summaryVersions,
          selectedSummaryVersionId: result.selectedSummaryVersionId,
          createdAt: result.createdAt,
        });

        const nextCards = (result.cards ?? []).map((card) => ({
          id: card.id,
          articleId: result.id,
          originalText: card.originalText,
          isImportant: card.isImportant,
          lemma: card.lemma,
          translationZh: card.translationZh,
          usageNote: card.usageNote,
          example: card.example,
          note: card.note,
          start: card.start,
          end: card.end,
          createdAt: card.createdAt ?? result.createdAt,
        }));
        setRemoteCards(nextCards);
      })
      .finally(() => {
        setLoadingRemote(false);
      });
  }, [article, id]);

  useEffect(() => {
    return () => {
      for (const key in saveTimersRef.current) {
        window.clearTimeout(saveTimersRef.current[key]);
      }
      saveTimersRef.current = {};
    };
  }, []);

  useEffect(() => {
    if (!activeArticle) {
      setSelectedSummaryVersionId(null);
      return;
    }

    const nextSelected =
      activeArticle.selectedSummaryVersionId && summaryVersions.some((item) => item.id === activeArticle.selectedSummaryVersionId)
        ? activeArticle.selectedSummaryVersionId
        : summaryVersions[summaryVersions.length - 1]?.id ?? null;
    setSelectedSummaryVersionId(nextSelected);
  }, [activeArticle?.id, activeArticle?.selectedSummaryVersionId, summaryVersions]);

  useEffect(() => {
    if (!activeArticle?.content) {
      return;
    }

    void getSentenceTranslations({content: activeArticle.content})
      .then((result) => {
        setSentencePairs(result.items);
      })
      .catch(() => {
        setSentencePairs([]);
      });
  }, [activeArticle?.content]);

  const applyCardLocalChange = (cardId: string, updates: Partial<(typeof cards)[number]>) => {
    if (article) {
      updateCard(cardId, updates);
      return;
    }
    setRemoteCards((prev) => prev.map((card) => (card.id === cardId ? {...card, ...updates} : card)));
  };

  const flushCardUpdates = async (cardId: string) => {
    const pending = pendingCardUpdatesRef.current[cardId];
    if (!pending || Object.keys(pending).length === 0) {
      return;
    }

    delete pendingCardUpdatesRef.current[cardId];
    try {
      await updateCardRequest(cardId, pending);
    } catch (error) {
      pendingCardUpdatesRef.current[cardId] = {
        ...(pendingCardUpdatesRef.current[cardId] ?? {}),
        ...pending,
      };
      setDetailError(error instanceof Error ? error.message : '卡片保存失败，请重试');
    }
  };

  const queueCardPersist = (cardId: string, updates: Partial<ApiCard>) => {
    pendingCardUpdatesRef.current[cardId] = {
      ...(pendingCardUpdatesRef.current[cardId] ?? {}),
      ...updates,
    };

    if (saveTimersRef.current[cardId]) {
      window.clearTimeout(saveTimersRef.current[cardId]);
    }

    saveTimersRef.current[cardId] = window.setTimeout(() => {
      void flushCardUpdates(cardId);
      delete saveTimersRef.current[cardId];
    }, 1200);
  };

  const handleDeleteCard = async (cardId: string) => {
    if (!activeCards.find((item) => item.id === cardId)) {
      return;
    }

    setDetailError('');
    try {
      await deleteCardRequest(cardId);
      if (article) {
        removeCard(cardId);
      } else {
        setRemoteCards((prev) => prev.filter((card) => card.id !== cardId));
      }
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : '删除卡片失败');
    }
  };

  if (loadingRemote && !activeArticle) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-stone-200 text-center">
          <p className="text-stone-600">正在加载文章...</p>
        </div>
      </div>
    );
  }

  if (!activeArticle && !loadingRemote) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-stone-200 text-center">
          <p className="text-stone-500 mb-4">文章未找到</p>
          <button
            onClick={() => navigate('/library')}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2 rounded-full text-sm font-medium transition-colors"
          >
            返回知识库
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 font-sans pb-20">
      <header className="sticky top-0 z-10 bg-white border-b border-stone-200 px-4 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center space-x-2">
          <button onClick={() => navigate('/library')} className="p-2 hover:bg-stone-100 rounded-full transition-colors">
            <ChevronLeft className="w-5 h-5 text-stone-600" />
          </button>
          <h1 className="text-base font-medium text-stone-800 truncate max-w-[200px] sm:max-w-xs">
            {activeArticle?.title}
          </h1>
        </div>
        <button
          disabled
          title="即将上线"
          className="bg-stone-100 text-stone-400 px-4 py-2 rounded-full text-sm font-medium flex items-center space-x-2 cursor-not-allowed"
        >
          <Download className="w-4 h-4" />
          <span className="hidden sm:inline">导出 PDF（即将上线）</span>
        </button>
        <button
          onClick={handleContinueReading}
          className="bg-white hover:bg-stone-50 text-stone-700 border border-stone-200 px-4 py-2 rounded-full text-sm font-medium transition-colors"
        >
          返回继续划线
        </button>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        {detailError && (
          <section className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {detailError}
          </section>
        )}

        <section className="bg-white rounded-2xl shadow-sm border border-stone-100 overflow-hidden">
          <button
            onClick={() => setIsPointsOpen(!isPointsOpen)}
            className="w-full px-6 py-4 flex items-center justify-between bg-stone-50 hover:bg-stone-100 transition-colors"
          >
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 font-bold text-sm">A</div>
              <h2 className="text-lg font-semibold text-stone-800">本篇学习提要</h2>
            </div>
            {isPointsOpen ? <ChevronUp className="w-5 h-5 text-stone-500" /> : <ChevronDown className="w-5 h-5 text-stone-500" />}
          </button>

          {isPointsOpen && (
            <div className="p-6 border-t border-stone-100">
              {summaryVersions.length > 1 && (
                <div className="mb-4 flex flex-wrap gap-2">
                  {summaryVersions.map((version) => (
                    <button
                      key={version.id}
                      onClick={() => setSelectedSummaryVersionId(version.id)}
                      className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                        version.id === selectedSummaryVersionId
                          ? 'bg-stone-900 text-white'
                          : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                      }`}
                    >
                      {version.label}
                    </button>
                  ))}
                </div>
              )}
              <ul className="space-y-3">
                {displayedLearningPoints.map((point, idx) => (
                  <li key={idx} className="flex items-start space-x-3 text-stone-600 text-sm leading-relaxed">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-2 flex-shrink-0"></span>
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
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
                {(sentencePairs.length ? sentencePairs : [{source: activeArticle?.content || '', translationZh: currentSummaryVersion?.fullTranslationZh || activeArticle?.fullTranslationZh || ''}]).map((pair, idx) => (
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
            <h2 className="text-lg font-semibold text-stone-800">卡片区 ({activeCards.length})</h2>
          </div>

          {activeCards.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center border border-stone-100 border-dashed">
              <p className="text-stone-500">该文章暂无卡片</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {activeCards.map((card) => (
                <div key={card.id} className={`bg-white rounded-2xl p-5 shadow-sm border transition-colors ${card.isImportant ? 'border-amber-300 ring-1 ring-amber-100' : 'border-stone-200'}`}>
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <p className="text-xs font-medium text-stone-400 uppercase tracking-wider mb-1">原文</p>
                      <h3 className="text-lg font-semibold text-stone-900 font-serif">{card.originalText}</h3>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => {
                          setDeleteCardId(card.id);
                        }}
                        className="p-2 rounded-full transition-colors bg-stone-100 text-stone-400 hover:bg-red-50 hover:text-red-500"
                        title="删除卡片"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          applyCardLocalChange(card.id, {isImportant: !card.isImportant});
                          void updateCardRequest(card.id, {isImportant: !card.isImportant}).catch((error) => {
                            applyCardLocalChange(card.id, {isImportant: card.isImportant});
                            setDetailError(error instanceof Error ? error.message : '更新重点状态失败，已回滚');
                          });
                        }}
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
                        onChange={(e) => {
                          const value = e.target.value;
                          setDetailError('');
                          applyCardLocalChange(card.id, {lemma: value});
                          queueCardPersist(card.id, {lemma: value});
                        }}
                        onBlur={() => {
                          void flushCardUpdates(card.id);
                        }}
                        placeholder="如: делать / сделать"
                        className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-stone-500 mb-1">中文</label>
                      <input
                        type="text"
                        value={card.translationZh}
                        onChange={(e) => {
                          const value = e.target.value;
                          setDetailError('');
                          applyCardLocalChange(card.id, {translationZh: value});
                          queueCardPersist(card.id, {translationZh: value});
                        }}
                        onBlur={() => {
                          void flushCardUpdates(card.id);
                        }}
                        className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-stone-500 mb-1">核心用法</label>
                      <input
                        type="text"
                        value={card.usageNote}
                        onChange={(e) => {
                          const value = e.target.value;
                          setDetailError('');
                          applyCardLocalChange(card.id, {usageNote: value});
                          queueCardPersist(card.id, {usageNote: value});
                        }}
                        onBlur={() => {
                          void flushCardUpdates(card.id);
                        }}
                        placeholder="一句话简明用法"
                        className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-stone-500 mb-1">例句</label>
                      <textarea
                        value={card.example}
                        onChange={(e) => {
                          const value = e.target.value;
                          setDetailError('');
                          applyCardLocalChange(card.id, {example: value});
                          queueCardPersist(card.id, {example: value});
                        }}
                        onBlur={() => {
                          void flushCardUpdates(card.id);
                        }}
                        placeholder="输入例句..."
                        rows={2}
                        className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all resize-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-stone-500 mb-1">备注</label>
                      <textarea
                        value={card.note}
                        onChange={(e) => {
                          const value = e.target.value;
                          setDetailError('');
                          applyCardLocalChange(card.id, {note: value});
                          queueCardPersist(card.id, {note: value});
                        }}
                        onBlur={() => {
                          void flushCardUpdates(card.id);
                        }}
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
                  void handleDeleteCard(deleteCardId);
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
