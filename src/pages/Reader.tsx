import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { enrichHighlight, getPreprocessStatus, preprocessArticle, translateHighlight } from '../lib/api';
import { useStore } from '../store';
import { ChevronLeft, Star, Trash2, Edit3, BookOpen } from 'lucide-react';

const MOCK_ARTICLE = `Вчера я гулял по парку и увидел красивую птицу. Она сидела на ветке и пела песню. Погода была замечательная, светило солнце, и дул легкий ветерок. Я решил сесть на скамейку и почитать книгу. Это был один из тех дней, когда хочется просто наслаждаться моментом и никуда не спешить. Вдруг ко мне подошел маленький мальчик и спросил, который час. Я улыбнулся и ответил ему. Такие простые моменты делают нашу жизнь по-настоящему счастливой.`;

export default function Reader() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    articleTitle,
    articleText,
    setArticle,
    setActiveArticleId,
    highlights,
    clearHighlights,
    addHighlight,
    removeHighlight,
    updateHighlight,
    translationCache,
    setTranslationCache,
  } = useStore();
  
  const [isEditing, setIsEditing] = useState(!articleText);
  const [titleInput, setTitleInput] = useState(articleTitle || '俄语精读：公园散步');
  const [textInput, setTextInput] = useState(articleText || MOCK_ARTICLE);

  const [popover, setPopover] = useState<{
    visible: boolean;
    x: number;
    y: number;
    isAbove: boolean;
    text: string;
    start: number;
    end: number;
    loading: boolean;
    translationZh: string;
    lemma: string;
    usageNote: string;
    example: string;
    note: string;
    error?: string;
    existingId?: string;
    isImportant?: boolean;
  } | null>(null);
  const [preprocessStatus, setPreprocessStatus] = useState<{
    phase: 'idle' | 'running' | 'done' | 'error';
    cachedCount: number;
    totalCount: number;
  }>({
    phase: 'idle',
    cachedCount: 0,
    totalCount: 0,
  });
  
  const contentRef = useRef<HTMLDivElement>(null);
  const preprocessTimerRef = useRef<number | null>(null);
  const isResumeMode = new URLSearchParams(location.search).get('resume') === '1';

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('new') !== '1') {
      return;
    }

    setArticle('', '');
    setActiveArticleId(null);
    clearHighlights();
    setTitleInput('俄语精读：新文章');
    setTextInput('');
    setIsEditing(true);
    setPopover(null);
  }, [location.search, clearHighlights, setArticle]);

  const getCacheKey = (originalText: string, contextSentence: string) => {
    return `${originalText}::${contextSentence}`.toLowerCase();
  };

  const getContextSentence = (text: string, start: number, end: number) => {
    const left = text.slice(0, start);
    const right = text.slice(end);
    const leftBoundary = Math.max(
      left.lastIndexOf('.'),
      left.lastIndexOf('!'),
      left.lastIndexOf('?'),
      left.lastIndexOf('\n')
    );
    const rightCandidates = [
      right.indexOf('.'),
      right.indexOf('!'),
      right.indexOf('?'),
      right.indexOf('\n'),
    ].filter((value) => value >= 0);
    const rightBoundary = rightCandidates.length ? Math.min(...rightCandidates) : right.length - 1;

    return text.slice(leftBoundary + 1, end + rightBoundary + 1).trim();
  };

  const clearPreprocessTimer = () => {
    if (preprocessTimerRef.current) {
      window.clearTimeout(preprocessTimerRef.current);
      preprocessTimerRef.current = null;
    }
  };

  const monitorPreprocessProgress = (content: string, round = 0) => {
    if (!content.trim()) {
      return;
    }

    void getPreprocessStatus({content})
      .then((status) => {
        setPreprocessStatus({
          phase: status.done ? 'done' : 'running',
          cachedCount: status.cachedCount,
          totalCount: status.totalCount,
        });

        if (!status.done && round < 60) {
          preprocessTimerRef.current = window.setTimeout(() => {
            monitorPreprocessProgress(content, round + 1);
          }, 1500);
        }
      })
      .catch(() => {
        setPreprocessStatus((prev) => ({
          ...prev,
          phase: 'error',
        }));
      });
  };

  const triggerPreprocess = (content: string) => {
    if (!content.trim()) {
      return;
    }
    clearPreprocessTimer();
    setPreprocessStatus({phase: 'running', cachedCount: 0, totalCount: 0});
    void preprocessArticle({content})
      .then(() => {
        monitorPreprocessProgress(content, 0);
      })
      .catch(() => {
        setPreprocessStatus((prev) => ({
          ...prev,
          phase: 'error',
        }));
      });
  };

  useEffect(() => {
    if (!isEditing && articleText.trim()) {
      monitorPreprocessProgress(articleText, 0);
    }

    return () => {
      clearPreprocessTimer();
    };
  }, [isEditing, articleText]);

  useEffect(() => {
    if (isEditing) return;

    const handlePointerUp = (e: Event) => {
      const target = e.target as Element;
      
      // Ignore clicks inside the popover
      if (target.closest('.highlight-popover')) return;

      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) {
        // If clicking outside the popover and NOT on an existing highlight mark, hide it
        if (popover?.visible && !target.closest('mark')) {
          setPopover(null);
        }
        return;
      }

      // Ensure selection is within our content
      if (
        contentRef.current &&
        contentRef.current.contains(selection.anchorNode) &&
        contentRef.current.contains(selection.focusNode)
      ) {
        const range = selection.getRangeAt(0);
        const rawSelectedText = range.toString();
        const text = rawSelectedText.trim();
        if (!text) return;
        
        // Calculate character offset
        const preSelectionRange = range.cloneRange();
        preSelectionRange.selectNodeContents(contentRef.current);
        preSelectionRange.setEnd(range.startContainer, range.startOffset);
        let start = preSelectionRange.toString().length;
        let end = start + rawSelectedText.length;

        // Keep offsets aligned with trimmed text shown in popover/cards.
        const leadingWhitespace = rawSelectedText.length - rawSelectedText.trimStart().length;
        const trailingWhitespace = rawSelectedText.length - rawSelectedText.trimEnd().length;
        start += leadingWhitespace;
        end -= trailingWhitespace;

        const rect = range.getBoundingClientRect();

        let x = rect.left + rect.width / 2;
        let y = rect.top - 10;
        let isAbove = true;

        // Viewport clamp
        const popoverWidth = 256; // w-64
        const popoverHeight = 160; // approx height

        if (x - popoverWidth / 2 < 10) x = popoverWidth / 2 + 10;
        if (x + popoverWidth / 2 > window.innerWidth - 10) x = window.innerWidth - popoverWidth / 2 - 10;

        if (y - popoverHeight < 0) {
          y = rect.bottom + 10;
          isAbove = false;
        }

        setPopover({
          visible: true,
          x,
          y,
          isAbove,
          text,
          start,
          end,
          loading: false,
          translationZh: '',
          lemma: '',
          usageNote: '',
          example: '',
          note: '',
        });
      }
    };

    document.addEventListener('pointerup', handlePointerUp);
    document.addEventListener('touchend', handlePointerUp);
    return () => {
      document.removeEventListener('pointerup', handlePointerUp);
      document.removeEventListener('touchend', handlePointerUp);
    };
  }, [popover, isEditing, articleText]);

  const handleSaveHighlight = async (isImportant: boolean) => {
    if (!popover) return;

    const contextSentence = getContextSentence(articleText, popover.start, popover.end);
    const cacheKey = getCacheKey(popover.text, contextSentence);
    const triggerDetailEnrichment = (highlightId: string, translationZh: string) => {
      void enrichHighlight({
        originalText: popover.text,
        contextSentence,
        translationZh,
      })
        .then((detail) => {
          if (detail.lemma || detail.usageNote || detail.example || detail.note) {
            updateHighlight(highlightId, {
              lemma: detail.lemma,
              usageNote: detail.usageNote,
              example: detail.example,
              note: detail.note,
            });
            setTranslationCache(cacheKey, {
              translationZh,
              lemma: detail.lemma,
              usageNote: detail.usageNote,
              example: detail.example,
              note: detail.note,
            });
            setPopover((prev) =>
              prev && prev.existingId === highlightId
                ? {
                    ...prev,
                    lemma: detail.lemma,
                    usageNote: detail.usageNote,
                    example: detail.example,
                    note: detail.note,
                  }
                : prev
            );
          }
        })
        .catch(() => {});
    };

    const cached = translationCache[cacheKey];
    if (cached) {
      const exists = highlights.find(h => h.start === popover.start && h.end === popover.end);
      let highlightId = exists?.id;
      if (!exists) {
        highlightId = Date.now().toString();
        addHighlight({
          id: highlightId,
          originalText: popover.text,
          isImportant,
          lemma: cached.lemma,
          translationZh: cached.translationZh,
          usageNote: cached.usageNote,
          example: cached.example,
          note: cached.note,
          start: popover.start,
          end: popover.end,
        });
      } else if (exists.isImportant !== isImportant) {
        updateHighlight(exists.id, {isImportant});
      }
      window.getSelection()?.removeAllRanges();
      setPopover((prev) =>
        prev
          ? {
              ...prev,
              loading: false,
              existingId: highlightId,
              isImportant,
              translationZh: cached.translationZh,
              lemma: cached.lemma,
              usageNote: cached.usageNote,
              example: cached.example,
              note: cached.note,
              error: undefined,
            }
          : prev
      );
      if (highlightId) {
        triggerDetailEnrichment(highlightId, cached.translationZh);
      }
      return;
    }

    setPopover((prev) => (prev ? {...prev, loading: true, error: undefined} : prev));
    let result;
    try {
      result = await translateHighlight({
        originalText: popover.text,
        contextSentence,
        articleContext: contextSentence,
      });
      setTranslationCache(cacheKey, result);
    } catch (error) {
      setPopover((prev) =>
        prev
          ? {
              ...prev,
              loading: false,
              error: error instanceof Error ? error.message : '翻译失败',
            }
          : prev
      );
      return;
    }
    
    // Check if already highlighted (by exact offset)
    const exists = highlights.find(h => h.start === popover.start && h.end === popover.end);
    let highlightId = exists?.id;
    if (!exists) {
      highlightId = Date.now().toString();
      addHighlight({
        id: highlightId,
        originalText: popover.text,
        isImportant,
        lemma: result.lemma,
        translationZh: result.translationZh,
        usageNote: result.usageNote,
        example: result.example,
        note: result.note,
        start: popover.start,
        end: popover.end,
      });
    } else if (exists.isImportant !== isImportant) {
      updateHighlight(exists.id, {isImportant});
    }
    
    window.getSelection()?.removeAllRanges();
    setPopover((prev) =>
      prev
        ? {
            ...prev,
            loading: false,
            existingId: highlightId,
            isImportant,
            translationZh: result.translationZh,
            lemma: result.lemma,
            usageNote: result.usageNote,
            example: result.example,
            note: result.note,
            error: undefined,
          }
        : prev
    );
    if (highlightId) {
      triggerDetailEnrichment(highlightId, result.translationZh);
    }
  };

  const handleMarkClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const highlight = highlights.find(h => h.id === id);
    
    if (highlight) {
      const target = e.currentTarget as HTMLElement;
      const rect = target.getBoundingClientRect();
      
      let x = rect.left + rect.width / 2;
      let y = rect.top - 10;
      let isAbove = true;

      const popoverWidth = 256;
      const popoverHeight = 160;

      if (x - popoverWidth / 2 < 10) x = popoverWidth / 2 + 10;
      if (x + popoverWidth / 2 > window.innerWidth - 10) x = window.innerWidth - popoverWidth / 2 - 10;

      if (y - popoverHeight < 0) {
        y = rect.bottom + 10;
        isAbove = false;
      }

      setPopover({
        visible: true,
        x,
        y,
        isAbove,
        text: highlight.originalText,
        start: highlight.start || 0,
        end: highlight.end || 0,
        loading: false,
        translationZh: highlight.translationZh,
        lemma: highlight.lemma,
        usageNote: highlight.usageNote,
        example: highlight.example,
        note: highlight.note,
        existingId: highlight.id,
        isImportant: highlight.isImportant
      });
      window.getSelection()?.removeAllRanges();
    }
  };

  const handleStartReading = () => {
    if (!textInput.trim()) return;
    setArticle(titleInput || '未命名文章', textInput);
    triggerPreprocess(textInput);
    setIsEditing(false);
  };

  // Offset-based rendering with overlap merging
  const renderContent = () => {
    const text = articleText;
    if (!highlights.length) return <div className="text-lg leading-relaxed text-gray-800 whitespace-pre-wrap">{text}</div>;

    // Filter valid highlights and sort by start
    const validHighlights = highlights.filter(h => typeof h.start === 'number' && typeof h.end === 'number');
    const sorted = [...validHighlights].sort((a, b) => a.start - b.start);

    // Merge overlaps
    const merged: (typeof highlights[0])[] = [];
    for (const h of sorted) {
      if (!merged.length) {
        merged.push({ ...h });
      } else {
        const last = merged[merged.length - 1];
        if (h.start < last.end) {
          last.end = Math.max(last.end, h.end);
          last.isImportant = last.isImportant || h.isImportant;
        } else {
          merged.push({ ...h });
        }
      }
    }

    const nodes: React.ReactNode[] = [];
    let lastIndex = 0;

    merged.forEach((h) => {
      if (h.start > lastIndex) {
        nodes.push(<span key={`text-${lastIndex}`}>{text.slice(lastIndex, h.start)}</span>);
      }
      const bgClass = h.isImportant ? 'bg-amber-200 border-b-2 border-amber-400' : 'bg-blue-100';
      nodes.push(
        <mark
          key={`mark-${h.id}`}
          data-id={h.id}
          className={`${bgClass} rounded px-1 text-gray-900 cursor-pointer transition-colors hover:brightness-95`}
          onClick={(e) => handleMarkClick(e, h.id)}
        >
          {text.slice(h.start, h.end)}
          {h.isImportant && <Star className="inline w-3 h-3 ml-1 text-amber-500 fill-amber-500 align-[-1px] pointer-events-none" />}
        </mark>
      );
      lastIndex = h.end;
    });

    if (lastIndex < text.length) {
      nodes.push(<span key={`text-${lastIndex}`}>{text.slice(lastIndex)}</span>);
    }

    return <div className="text-lg leading-relaxed text-gray-800 whitespace-pre-wrap">{nodes}</div>;
  };

  if (isEditing) {
    return (
      <div className="min-h-screen bg-stone-50 text-stone-900 font-sans">
        <header className="sticky top-0 z-10 bg-white border-b border-stone-200 px-4 py-3 flex items-center justify-between shadow-sm">
          <div className="flex items-center space-x-2">
            <button onClick={() => navigate('/library')} className="p-2 hover:bg-stone-100 rounded-full transition-colors mr-1" title="返回知识库">
              <ChevronLeft className="w-5 h-5 text-stone-600" />
            </button>
            <div className="w-8 h-8 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center">
              <BookOpen className="w-4 h-4" />
            </div>
            <h1 className="text-base font-medium text-stone-800">导入文章</h1>
          </div>
          <button
            onClick={handleStartReading}
            disabled={!textInput.trim()}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-stone-300 disabled:cursor-not-allowed text-white px-4 py-2 rounded-full text-sm font-medium transition-colors shadow-sm"
          >
            开始精读
          </button>
        </header>

        <main className="max-w-4xl mx-auto px-6 py-12">
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-stone-100 space-y-6">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-2">文章标题</label>
              <input
                type="text"
                value={titleInput}
                onChange={(e) => setTitleInput(e.target.value)}
                placeholder="输入文章标题..."
                className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 text-stone-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-lg font-medium"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-2">文章正文 (俄语)</label>
              <textarea
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder="在此粘贴需要精读的俄语文章..."
                rows={12}
                className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 text-stone-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-lg leading-relaxed resize-y"
              />
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 font-sans">
      {/* Top Bar */}
      <header className="sticky top-0 z-10 bg-white border-b border-stone-200 px-4 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center space-x-2">
          <button onClick={() => navigate('/library')} className="p-2 hover:bg-stone-100 rounded-full transition-colors group relative" title="返回知识库">
            <ChevronLeft className="w-5 h-5 text-stone-600" />
          </button>
          <h1 className="text-base font-medium text-stone-800">{articleTitle}</h1>
          <button 
            onClick={() => setIsEditing(true)}
            className="ml-2 p-1.5 text-stone-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-md transition-colors"
            title="编辑文章"
          >
            <Edit3 className="w-4 h-4" />
          </button>
        </div>
        <div className="flex items-center gap-3">
          {preprocessStatus.phase !== 'idle' && (
            <div
              className={`text-xs px-3 py-1 rounded-full ${
                preprocessStatus.phase === 'done'
                  ? 'bg-emerald-100 text-emerald-700'
                  : preprocessStatus.phase === 'error'
                    ? 'bg-red-100 text-red-700'
                    : 'bg-blue-100 text-blue-700'
              }`}
            >
              {preprocessStatus.phase === 'done'
                ? '已完成预翻译'
                : preprocessStatus.phase === 'error'
                  ? '预翻译状态获取失败'
                  : `预翻译中 ${preprocessStatus.cachedCount}/${preprocessStatus.totalCount || '?'}`}
            </div>
          )}
        <button
          onClick={() => navigate(isResumeMode ? '/summary?resume=1' : '/confirm')}
          className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-full text-sm font-medium transition-colors shadow-sm"
        >
          完成本篇精读
        </button>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-6 py-12">
        <div ref={contentRef} className="bg-white p-8 rounded-2xl shadow-sm border border-stone-100 relative">
          {renderContent()}
        </div>
      </main>

      {/* Popover */}
      {popover?.visible && (
        <div
          className={`highlight-popover fixed z-50 bg-white rounded-xl shadow-xl border border-stone-200 p-4 w-64 transform -translate-x-1/2 ${popover.isAbove ? '-translate-y-full' : ''}`}
          style={{ left: popover.x, top: popover.y }}
        >
          <div className="mb-3">
            <p className="text-xs text-stone-500 mb-1 font-medium">划线内容</p>
            <p className="text-sm font-medium text-stone-900 mb-2">{popover.text}</p>
            <p className="text-xs text-stone-500 mb-1 font-medium">AI 翻译</p>
            {popover.loading ? (
              <div className="flex items-center space-x-2 text-stone-400 text-sm">
                <div className="w-4 h-4 border-2 border-stone-300 border-t-emerald-500 rounded-full animate-spin"></div>
                <span>加载中...</span>
              </div>
            ) : (
              <p className="text-sm text-stone-800 bg-stone-50 p-2 rounded-lg border border-stone-100">
                {popover.translationZh || popover.error || '点击“保存划线”后即时翻译'}
              </p>
            )}
          </div>
          
          <div className="flex space-x-2 mt-4">
            {popover.existingId ? (
              <>
                <button
                  onClick={() => {
                    removeHighlight(popover.existingId!);
                    setPopover(null);
                  }}
                  className="flex-1 bg-red-50 hover:bg-red-100 text-red-600 py-2 px-3 rounded-lg text-xs font-medium transition-colors flex items-center justify-center space-x-1"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>删除</span>
                </button>
                <button
                  onClick={() => {
                    updateHighlight(popover.existingId!, { isImportant: !popover.isImportant });
                    setPopover(prev => prev ? { ...prev, isImportant: !prev.isImportant } : null);
                  }}
                  className={`flex-1 border py-2 px-3 rounded-lg text-xs font-medium flex items-center justify-center space-x-1 transition-colors ${
                    popover.isImportant 
                      ? 'bg-stone-100 hover:bg-stone-200 text-stone-600 border-stone-200' 
                      : 'bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-200'
                  }`}
                >
                  <Star className={`w-3 h-3 ${popover.isImportant ? '' : 'fill-amber-500 text-amber-500'}`} />
                  <span>{popover.isImportant ? '取消重点' : '标为重点'}</span>
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => void handleSaveHighlight(false)}
                  disabled={popover.loading}
                  className="flex-1 bg-stone-100 hover:bg-stone-200 text-stone-700 py-2 px-3 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                >
                  保存划线
                </button>
                <button
                  onClick={() => void handleSaveHighlight(true)}
                  disabled={popover.loading}
                  className="flex-1 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 py-2 px-3 rounded-lg text-xs font-medium flex items-center justify-center space-x-1 transition-colors disabled:opacity-50"
                >
                  <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                  <span>标为重点</span>
                </button>
              </>
            )}
          </div>
          
          {/* Popover Arrow */}
          <div className={`absolute left-1/2 transform -translate-x-1/2 rotate-45 w-3 h-3 bg-white ${
            popover.isAbove 
              ? 'bottom-0 translate-y-1/2 border-r border-b border-stone-200' 
              : 'top-0 -translate-y-1/2 border-l border-t border-stone-200'
          }`}></div>
        </div>
      )}
    </div>
  );
}
