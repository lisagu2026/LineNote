import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import {
  type ApiCard,
  deleteArticle as deleteArticleRequest,
  deleteCard as deleteCardRequest,
  fetchHealth,
  listArticlesWithCards,
  logout as logoutRequest,
  updateCard as updateCardRequest,
} from '../lib/api';
import { Search, Plus, ChevronRight, BookOpen, Star, LayoutGrid, CheckSquare, Square, Download, Trash2, X, ExternalLink, Maximize2, Minimize2, LogOut } from 'lucide-react';

export default function Library() {
  const navigate = useNavigate();
  const { articles, cards, authUser, clearAuthSession, replaceLibraryData, updateCard, removeArticle, removeCard } = useStore();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'articles' | 'cards'>('articles');
  const [showImportantOnly, setShowImportantOnly] = useState(false);
  const [isAllExpanded, setIsAllExpanded] = useState(false);
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(new Set());
  const [drawerCardId, setDrawerCardId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'article' | 'card', id: string } | null>(null);
  const [backendStatus, setBackendStatus] = useState<'checking' | 'connected' | 'offline'>('checking');
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [libraryError, setLibraryError] = useState('');
  const pendingCardUpdatesRef = useRef<Record<string, Partial<ApiCard>>>({});
  const saveTimersRef = useRef<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        await fetchHealth();
        if (!cancelled) {
          setBackendStatus('connected');
        }
      } catch {
        if (!cancelled) {
          setBackendStatus('offline');
        }
      }

      try {
        const resolved = await listArticlesWithCards();

        if (cancelled) {
          return;
        }

        const nextArticles = resolved.map((item) => ({
          id: item.id,
          title: item.title,
          content: item.content,
          learningPoints: item.learningPoints,
          fullTranslationZh: item.fullTranslationZh,
          createdAt: item.createdAt,
        }));

        const nextCards = resolved.flatMap((item) =>
          (item.cards ?? []).map((card) => ({
            id: card.id,
            articleId: item.id,
            originalText: card.originalText,
            isImportant: card.isImportant,
            lemma: card.lemma,
            translationZh: card.translationZh,
            usageNote: card.usageNote,
            example: card.example,
            note: card.note,
            start: card.start,
            end: card.end,
            createdAt: card.createdAt ?? item.createdAt,
          })),
        );

        replaceLibraryData(nextArticles, nextCards);
        setLibraryError('');
      } catch (error) {
        if (!cancelled) {
          setLibraryError(error instanceof Error ? error.message : '加载知识库失败');
        }
      } finally {
        if (!cancelled) {
          setLibraryLoading(false);
        }
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [replaceLibraryData]);

  useEffect(() => {
    return () => {
      for (const key in saveTimersRef.current) {
        window.clearTimeout(saveTimersRef.current[key]);
      }
      saveTimersRef.current = {};
    };
  }, []);

  // Filter Articles
  const filteredArticles = articles.filter((a) =>
    a.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Filter Cards
  const filteredCards = cards.filter(
    (c) =>
      c.originalText.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.translationZh.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.usageNote.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.example.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.note.toLowerCase().includes(searchQuery.toLowerCase())
  );

  let displayCards = filteredCards;
  if (showImportantOnly) {
    displayCards = displayCards.filter((c) => c.isImportant);
  }
  // Sort by createdAt desc
  displayCards.sort((a, b) => b.createdAt - a.createdAt);

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const toggleCardSelection = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newSet = new Set(selectedCardIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedCardIds(newSet);
  };

  const drawerCard = cards.find(c => c.id === drawerCardId);
  const drawerArticle = drawerCard ? articles.find(a => a.id === drawerCard.articleId) : null;

  const toggleImportant = async (cardId: string, nextValue: boolean) => {
    const current = cards.find((item) => item.id === cardId);
    if (!current) {
      return;
    }

    setLibraryError('');
    updateCard(cardId, {isImportant: nextValue});
    try {
      await updateCardRequest(cardId, {isImportant: nextValue});
    } catch (error) {
      updateCard(cardId, {isImportant: current.isImportant});
      setLibraryError(error instanceof Error ? error.message : '更新重点状态失败，已回滚');
    }
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
      setLibraryError(error instanceof Error ? error.message : '卡片保存失败，请重试');
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

  const handleDeleteConfirm = async () => {
    if (!deleteConfirm) {
      return;
    }

    const target = deleteConfirm;
    setDeleteConfirm(null);

    try {
      if (target.type === 'article') {
        await deleteArticleRequest(target.id);
        removeArticle(target.id);
      } else {
        await deleteCardRequest(target.id);
        removeCard(target.id);
      }
    } catch (error) {
      setLibraryError(error instanceof Error ? error.message : '删除失败');
    }
  };

  const handleLogout = async () => {
    try {
      await logoutRequest();
    } catch (_error) {
      // Clear local auth state even if the server session is already gone.
    }
    clearAuthSession();
    navigate('/auth', {replace: true});
  };

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 font-sans pb-20">
      {/* Top Bar */}
      <header className="sticky top-0 z-10 bg-white border-b border-stone-200 px-4 py-3 flex items-center justify-between shadow-sm">
        <h1 className="text-lg font-semibold text-stone-800 flex items-center space-x-2">
          <BookOpen className="w-5 h-5 text-emerald-600" />
          <span>知识库</span>
        </h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/reader?new=1')}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-full text-sm font-medium transition-colors shadow-sm flex items-center space-x-1"
          >
            <Plus className="w-4 h-4" />
            <span>新建/导入</span>
          </button>
          <button
            onClick={handleLogout}
            className="rounded-full border border-stone-200 bg-white px-3 py-2 text-sm text-stone-600 transition hover:bg-stone-50 flex items-center gap-2"
            title={authUser?.email || '退出登录'}
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">{authUser?.displayName || authUser?.email || '退出'}</span>
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <div className="flex justify-end">
          <div
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              backendStatus === 'connected'
                ? 'bg-emerald-100 text-emerald-700'
                : backendStatus === 'offline'
                  ? 'bg-red-100 text-red-700'
                  : 'bg-stone-200 text-stone-600'
            }`}
          >
            {backendStatus === 'connected'
              ? '后端已连接'
              : backendStatus === 'offline'
                ? '后端未启动'
                : '检测后端中'}
          </div>
        </div>

        {libraryError && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {libraryError}
          </div>
        )}

        {/* Search Box */}
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-stone-400" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={viewMode === 'articles' ? "搜索文章标题..." : "搜索卡片内容 (原文、中文、用法、例句、备注)..."}
            className="block w-full pl-10 pr-3 py-3 border border-stone-200 rounded-2xl leading-5 bg-white placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-sm"
          />
        </div>

        {/* View Toggle & Filters */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between space-y-4 sm:space-y-0">
          <div className="flex bg-stone-200/50 p-1 rounded-lg self-start">
            <button
              onClick={() => setViewMode('articles')}
              className={`flex items-center space-x-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === 'articles' ? 'bg-white text-stone-800 shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}
            >
              <BookOpen className="w-4 h-4" />
              <span>按文章</span>
            </button>
            <button
              onClick={() => setViewMode('cards')}
              className={`flex items-center space-x-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === 'cards' ? 'bg-white text-stone-800 shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}
            >
              <LayoutGrid className="w-4 h-4" />
              <span>按卡片</span>
            </button>
          </div>

          {viewMode === 'cards' && (
            <div className="flex items-center space-x-3 self-end sm:self-auto">
              <button
                onClick={() => setIsAllExpanded(!isAllExpanded)}
                className={`flex items-center space-x-1 px-3 py-1.5 rounded-full text-sm font-medium transition-colors border ${isAllExpanded ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-50'}`}
              >
                {isAllExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                <span>{isAllExpanded ? '折叠全部' : '展开全部'}</span>
              </button>
              <button
                onClick={() => setShowImportantOnly(!showImportantOnly)}
                className={`flex items-center space-x-1 px-3 py-1.5 rounded-full text-sm font-medium transition-colors border ${showImportantOnly ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-50'}`}
              >
                <Star className={`w-4 h-4 ${showImportantOnly ? 'fill-amber-500 text-amber-500' : ''}`} />
                <span>仅看重点</span>
              </button>
              {selectedCardIds.size > 0 && (
                <button
                  disabled
                  title="即将上线"
                  className="flex items-center space-x-1 px-3 py-1.5 rounded-full text-sm font-medium bg-stone-200 text-stone-500 cursor-not-allowed shadow-sm"
                >
                  <Download className="w-4 h-4" />
                  <span>导出选中（即将上线）</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Content Area */}
        {viewMode === 'articles' ? (
          /* Article View */
          <section>
            <h2 className="text-sm font-medium text-stone-500 mb-4 px-2">
              我的文章 ({filteredArticles.length})
            </h2>
            {libraryLoading ? (
              <div className="bg-white rounded-2xl p-12 text-center border border-stone-100 border-dashed">
                <p className="text-stone-500">正在加载知识库...</p>
              </div>
            ) : filteredArticles.length === 0 ? (
              <div className="bg-white rounded-2xl p-12 text-center border border-stone-100 border-dashed">
                <p className="text-stone-500 mb-4">{searchQuery ? '未找到匹配的文章' : '知识库还是空的，去精读第一篇文章吧！'}</p>
                {!searchQuery && (
                  <button
                    onClick={() => navigate('/reader?new=1')}
                    className="bg-stone-100 hover:bg-stone-200 text-stone-700 px-6 py-2 rounded-full text-sm font-medium transition-colors"
                  >
                    开始精读
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {filteredArticles.map((article) => {
                  const articleCards = cards.filter((c) => c.articleId === article.id);
                  const importantCount = articleCards.filter((c) => c.isImportant).length;

                  return (
                    <div
                      key={article.id}
                      onClick={() => navigate(`/library/article/${article.id}`)}
                      className="bg-white rounded-2xl p-5 shadow-sm border border-stone-200 hover:border-emerald-300 cursor-pointer transition-all flex flex-col sm:flex-row sm:items-center justify-between group"
                    >
                      <div className="mb-4 sm:mb-0">
                        <h3 className="text-lg font-semibold text-stone-800 mb-2 group-hover:text-emerald-700 transition-colors">
                          {article.title}
                        </h3>
                        <div className="flex items-center space-x-4 text-xs text-stone-500">
                          <span>{formatDate(article.createdAt)}</span>
                          <span className="flex items-center space-x-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-stone-300"></span>
                            <span>{articleCards.length} 张卡片</span>
                          </span>
                          {importantCount > 0 && (
                            <span className="flex items-center space-x-1 text-amber-600">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                              <span>{importantCount} 个重点</span>
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center space-x-2 text-sm font-medium text-emerald-600">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteConfirm({ type: 'article', id: article.id });
                          }}
                          className="p-1.5 text-stone-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors mr-2"
                          title="删除文章"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                        <span>打开</span>
                        <ChevronRight className="w-4 h-4" />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        ) : (
          /* Card View */
          <section>
            <h2 className="text-sm font-medium text-stone-500 mb-4 px-2">
              所有卡片 ({displayCards.length})
            </h2>
            {displayCards.length === 0 ? (
              <div className="bg-white rounded-2xl p-12 text-center border border-stone-100 border-dashed">
                <p className="text-stone-500">未找到匹配的卡片</p>
              </div>
            ) : (
              <div className={isAllExpanded ? "grid grid-cols-1 md:grid-cols-2 gap-4 items-start" : "space-y-3"}>
                {displayCards.map((card) => {
                  const isSelected = selectedCardIds.has(card.id);
                  const article = articles.find((a) => a.id === card.articleId);

                  return (
                    <div
                      key={card.id}
                      className={`bg-white rounded-2xl shadow-sm border transition-colors ${isSelected ? 'border-emerald-400 ring-1 ring-emerald-100' : card.isImportant ? 'border-amber-300' : 'border-stone-200'}`}
                    >
                      {isAllExpanded ? (
                        <div className="p-5 flex flex-col h-full">
                          <div className="flex items-start justify-between mb-4">
                            <div className="flex items-start space-x-3 overflow-hidden">
                              <button
                                onClick={(e) => toggleCardSelection(card.id, e)}
                                className="text-stone-400 hover:text-emerald-600 transition-colors flex-shrink-0 mt-1"
                              >
                                {isSelected ? <CheckSquare className="w-5 h-5 text-emerald-600" /> : <Square className="w-5 h-5" />}
                              </button>
                              <div className="min-w-0">
                                <h3 className="text-lg font-semibold text-stone-900 font-serif leading-snug break-words">{card.originalText}</h3>
                                <p className="text-stone-600 text-sm mt-1 break-words">{card.translationZh}</p>
                              </div>
                            </div>
                            <div className="flex items-center space-x-1 flex-shrink-0 ml-2">
                              <button
                                onClick={() => void toggleImportant(card.id, !card.isImportant)}
                                className={`p-1.5 rounded-full transition-colors ${card.isImportant ? 'bg-amber-100 text-amber-500' : 'bg-stone-100 text-stone-400 hover:bg-stone-200'}`}
                              >
                                <Star className={`w-4 h-4 ${card.isImportant ? 'fill-current' : ''}`} />
                              </button>
                              <button
                                onClick={() => setDeleteConfirm({ type: 'card', id: card.id })}
                                className="p-1.5 rounded-full transition-colors bg-stone-100 text-stone-400 hover:bg-red-50 hover:text-red-500"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                          
                          <div className="flex-1 space-y-3 bg-stone-50 rounded-xl p-4 border border-stone-100 text-sm mb-4">
                            {card.lemma && <div><span className="text-stone-400 text-xs block mb-0.5">原型</span><span className="text-stone-800">{card.lemma}</span></div>}
                            {card.usageNote && <div><span className="text-stone-400 text-xs block mb-0.5">核心用法</span><span className="text-stone-800">{card.usageNote}</span></div>}
                            {card.example && <div><span className="text-stone-400 text-xs block mb-0.5">例句</span><span className="text-stone-800">{card.example}</span></div>}
                            {card.note && <div><span className="text-stone-400 text-xs block mb-0.5">备注</span><span className="text-stone-800">{card.note}</span></div>}
                            {(!card.lemma && !card.usageNote && !card.example && !card.note) && <div className="text-stone-400 italic text-center py-2">暂无详细笔记</div>}
                          </div>

                          <div className="flex items-center justify-between text-xs text-stone-400 mt-auto pt-2 border-t border-stone-100">
                            <span className="flex items-center space-x-1 truncate max-w-[60%]">
                              <BookOpen className="w-3 h-3 flex-shrink-0" />
                              <span className="truncate">{article?.title || '未知文章'}</span>
                            </span>
                            <span>{formatDate(card.createdAt)}</span>
                          </div>
                        </div>
                      ) : (
                        <div
                          className="p-3 sm:p-4 flex items-center justify-between cursor-pointer hover:bg-stone-50 rounded-2xl transition-colors group"
                          onClick={() => setDrawerCardId(card.id)}
                        >
                          <div className="flex items-center space-x-3 overflow-hidden flex-1">
                            <button
                              onClick={(e) => toggleCardSelection(card.id, e)}
                              className="text-stone-400 hover:text-emerald-600 transition-colors flex-shrink-0"
                            >
                              {isSelected ? <CheckSquare className="w-5 h-5 text-emerald-600" /> : <Square className="w-5 h-5" />}
                            </button>
                            <div className="flex items-center space-x-2 min-w-0 flex-1">
                              <h3 className="text-base font-semibold text-stone-900 font-serif truncate max-w-[40%]">{card.originalText}</h3>
                              {card.isImportant && <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500 flex-shrink-0" />}
                              <span className="text-stone-300 mx-1 flex-shrink-0">|</span>
                              <span className="text-sm text-stone-600 truncate flex-1">{card.translationZh}</span>
                            </div>
                          </div>
                          <div className="flex items-center space-x-3 flex-shrink-0 ml-4">
                            <span className="text-xs text-stone-400 hidden sm:block">{formatDate(card.createdAt)}</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteConfirm({ type: 'card', id: card.id });
                              }}
                              className="p-1.5 text-stone-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                              title="删除卡片"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                            <ChevronRight className="w-5 h-5 text-stone-400" />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </main>

      {/* Right Drawer for Card Details */}
      {drawerCard && (
        <>
          {/* Overlay */}
          <div 
            className="fixed inset-0 bg-black/20 z-40 transition-opacity"
            onClick={() => setDrawerCardId(null)}
          />
          
          {/* Drawer Panel */}
          <div className="fixed inset-y-0 right-0 w-full sm:w-[400px] md:w-[480px] bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out flex flex-col border-l border-stone-200">
            {/* Drawer Header */}
            <div className="flex items-center justify-between p-4 border-b border-stone-100 bg-stone-50/50">
              <div className="flex items-center space-x-3">
                <button
                  onClick={() => void toggleImportant(drawerCard.id, !drawerCard.isImportant)}
                  className={`p-2 rounded-full transition-colors ${drawerCard.isImportant ? 'bg-amber-100 text-amber-500' : 'bg-white text-stone-400 hover:bg-stone-100 shadow-sm border border-stone-200'}`}
                  title={drawerCard.isImportant ? "取消重点" : "标记为重点"}
                >
                  <Star className={`w-4 h-4 ${drawerCard.isImportant ? 'fill-current' : ''}`} />
                </button>
                <button
                  onClick={() => {
                    setDeleteConfirm({ type: 'card', id: drawerCard.id });
                  }}
                  className="p-2 rounded-full transition-colors bg-white text-stone-400 hover:bg-red-50 hover:text-red-500 shadow-sm border border-stone-200"
                  title="删除卡片"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <button 
                onClick={() => setDrawerCardId(null)}
                className="p-2 text-stone-400 hover:text-stone-600 hover:bg-stone-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              
              {/* Source Article Link */}
              <div className="flex items-center justify-between bg-stone-50 p-3 rounded-xl border border-stone-100">
                <div className="flex items-center space-x-2 text-sm text-stone-600 overflow-hidden">
                  <BookOpen className="w-4 h-4 flex-shrink-0 text-emerald-600" />
                  <span className="truncate font-medium">{drawerArticle?.title || '未知文章'}</span>
                </div>
                <button
                  onClick={() => {
                    setDrawerCardId(null);
                    navigate(`/library/article/${drawerCard.articleId}`);
                  }}
                  className="flex items-center space-x-1 text-xs font-medium text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2 py-1 rounded-md transition-colors flex-shrink-0 ml-2"
                >
                  <span>查看原文</span>
                  <ExternalLink className="w-3 h-3" />
                </button>
              </div>

              {/* Text Content */}
              <div>
                <h3 className="text-xs font-medium text-stone-400 uppercase tracking-wider mb-2">俄语原文</h3>
                <p className="text-xl font-semibold text-stone-900 font-serif leading-relaxed">{drawerCard.originalText}</p>
              </div>

              <div>
                <h3 className="text-xs font-medium text-stone-400 uppercase tracking-wider mb-2">中文翻译</h3>
                <textarea
                  value={drawerCard.translationZh}
                  onChange={(e) => {
                    const value = e.target.value;
                    setLibraryError('');
                    updateCard(drawerCard.id, {translationZh: value});
                    queueCardPersist(drawerCard.id, {translationZh: value});
                  }}
                  onBlur={() => {
                    void flushCardUpdates(drawerCard.id);
                  }}
                  className="w-full bg-white border border-stone-200 rounded-xl px-4 py-3 text-stone-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all resize-none"
                  rows={2}
                />
              </div>

              {/* Editable Fields */}
              <div className="space-y-4 pt-4 border-t border-stone-100">
                <div>
                  <label className="block text-xs font-medium text-stone-500 mb-1.5">原型 (Lemma)</label>
                  <input
                    type="text"
                    value={drawerCard.lemma}
                    onChange={(e) => {
                      const value = e.target.value;
                      setLibraryError('');
                      updateCard(drawerCard.id, {lemma: value});
                      queueCardPersist(drawerCard.id, {lemma: value});
                    }}
                    onBlur={() => {
                      void flushCardUpdates(drawerCard.id);
                    }}
                    placeholder="如: делать / сделать"
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-stone-500 mb-1.5">核心用法</label>
                  <input
                    type="text"
                    value={drawerCard.usageNote}
                    onChange={(e) => {
                      const value = e.target.value;
                      setLibraryError('');
                      updateCard(drawerCard.id, {usageNote: value});
                      queueCardPersist(drawerCard.id, {usageNote: value});
                    }}
                    onBlur={() => {
                      void flushCardUpdates(drawerCard.id);
                    }}
                    placeholder="一句话简明用法"
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-stone-500 mb-1.5">例句</label>
                  <textarea
                    value={drawerCard.example}
                    onChange={(e) => {
                      const value = e.target.value;
                      setLibraryError('');
                      updateCard(drawerCard.id, {example: value});
                      queueCardPersist(drawerCard.id, {example: value});
                    }}
                    onBlur={() => {
                      void flushCardUpdates(drawerCard.id);
                    }}
                    placeholder="输入例句..."
                    rows={3}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all resize-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-stone-500 mb-1.5">备注</label>
                  <textarea
                    value={drawerCard.note}
                    onChange={(e) => {
                      const value = e.target.value;
                      setLibraryError('');
                      updateCard(drawerCard.id, {note: value});
                      queueCardPersist(drawerCard.id, {note: value});
                    }}
                    onBlur={() => {
                      void flushCardUpdates(drawerCard.id);
                    }}
                    placeholder="补充笔记..."
                    rows={3}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all resize-none"
                  />
                </div>
              </div>
              
              <div className="pt-4 border-t border-stone-100 text-center">
                <p className="text-xs text-stone-400">创建于 {formatDate(drawerCard.createdAt)}</p>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-lg p-6 max-w-sm w-full">
            <h3 className="text-lg font-semibold text-stone-900 mb-2">确认删除</h3>
            <p className="text-stone-600 mb-6">
              {deleteConfirm.type === 'article' ? '确定要删除这篇文章及其所有卡片吗？此操作无法恢复。' : '确定要删除这张卡片吗？此操作无法恢复。'}
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 text-sm font-medium text-stone-600 hover:bg-stone-100 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={() => void handleDeleteConfirm()}
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
