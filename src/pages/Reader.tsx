import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { translateHighlight } from '../lib/api';
import { useStore } from '../store';
import { ChevronLeft, Star, Trash2, Edit3, BookOpen } from 'lucide-react';

const MOCK_ARTICLE = `Вчера я гулял по парку и увидел красивую птицу. Она сидела на ветке и пела песню. Погода была замечательная, светило солнце, и дул легкий ветерок. Я решил сесть на скамейку и почитать книгу. Это был один из тех дней, когда хочется просто наслаждаться моментом и никуда не спешить. Вдруг ко мне подошел маленький мальчик и спросил, который час. Я улыбнулся и ответил ему. Такие простые моменты делают нашу жизнь по-настоящему счастливой.`;

export default function Reader() {
  const navigate = useNavigate();
  const {
    articleTitle,
    articleText,
    setArticle,
    highlights,
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
  
  const contentRef = useRef<HTMLDivElement>(null);
  const requestSeqRef = useRef(0);

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

      const text = selection.toString().trim();
      if (!text) return;

      // Ensure selection is within our content
      if (contentRef.current && contentRef.current.contains(selection.anchorNode)) {
        const range = selection.getRangeAt(0);
        
        // Calculate character offset
        const preSelectionRange = range.cloneRange();
        preSelectionRange.selectNodeContents(contentRef.current);
        preSelectionRange.setEnd(range.startContainer, range.startOffset);
        const start = preSelectionRange.toString().length;
        const end = start + range.toString().length;

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
          loading: true,
          translationZh: '',
          lemma: '',
          usageNote: '',
          example: '',
          note: '',
        });

        const contextSentence = getContextSentence(articleText, start, end);
        const cacheKey = getCacheKey(text, contextSentence);
        const cached = translationCache[cacheKey];
        if (cached) {
          setPopover((prev) =>
            prev && prev.text === text && prev.start === start && prev.end === end && !prev.existingId
              ? {
                  ...prev,
                  loading: false,
                  translationZh: cached.translationZh,
                  lemma: cached.lemma,
                  usageNote: cached.usageNote,
                  example: cached.example,
                  note: cached.note,
                  error: undefined,
                }
              : prev
          );
          return;
        }

        const requestId = ++requestSeqRef.current;
        void translateHighlight({
          originalText: text,
          contextSentence,
          articleContext: contextSentence,
        })
          .then((result) => {
            if (requestId !== requestSeqRef.current) return;
            setTranslationCache(cacheKey, result);
            setPopover((prev) =>
              prev && prev.text === text && prev.start === start && prev.end === end && !prev.existingId
                ? { ...prev, loading: false, ...result, error: undefined }
                : prev
            );
          })
          .catch((error) => {
            if (requestId !== requestSeqRef.current) return;
            setPopover((prev) =>
              prev && prev.text === text && prev.start === start && prev.end === end && !prev.existingId
                ? {
                    ...prev,
                    loading: false,
                    translationZh: '',
                    error: error instanceof Error ? error.message : '翻译失败',
                  }
                : prev
            );
          });
      }
    };

    document.addEventListener('pointerup', handlePointerUp);
    document.addEventListener('touchend', handlePointerUp);
    return () => {
      document.removeEventListener('pointerup', handlePointerUp);
      document.removeEventListener('touchend', handlePointerUp);
    };
  }, [popover, isEditing, articleText, translationCache, setTranslationCache]);

  const handleSaveHighlight = (isImportant: boolean) => {
    if (!popover) return;
    
    // Check if already highlighted (by exact offset)
    const exists = highlights.find(h => h.start === popover.start && h.end === popover.end);
    if (!exists) {
      addHighlight({
        id: Date.now().toString(),
        originalText: popover.text,
        isImportant,
        lemma: popover.lemma,
        translationZh: popover.translationZh,
        usageNote: popover.usageNote,
        example: popover.example,
        note: popover.note,
        start: popover.start,
        end: popover.end,
      });
    }
    
    window.getSelection()?.removeAllRanges();
    setPopover(null);
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
          {h.isImportant && <span className="text-amber-500 text-xs ml-1 pointer-events-none">⭐</span>}
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
        <button
          onClick={() => navigate('/confirm')}
          className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-full text-sm font-medium transition-colors shadow-sm"
        >
          完成本篇精读
        </button>
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
                {popover.translationZh || popover.error || '暂无翻译结果'}
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
                  onClick={() => handleSaveHighlight(false)}
                  disabled={popover.loading}
                  className="flex-1 bg-stone-100 hover:bg-stone-200 text-stone-700 py-2 px-3 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                >
                  保存划线
                </button>
                <button
                  onClick={() => handleSaveHighlight(true)}
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
