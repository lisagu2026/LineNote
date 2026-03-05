import React, {useEffect, useRef, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {createArticle, analyzeArticle} from '../lib/api';
import {useStore, Article, Card} from '../store';
import {ChevronLeft, Download, ChevronDown, ChevronUp, Star, Save} from 'lucide-react';

export default function Summary() {
  const navigate = useNavigate();
  const {
    articleTitle,
    articleText,
    highlights,
    replaceHighlights,
    updateHighlight,
    saveToLibrary,
    clearHighlights,
    setArticle,
  } = useStore();

  const [isOriginalOpen, setIsOriginalOpen] = useState(false);
  const [isTranslationOpen, setIsTranslationOpen] = useState(false);
  const [learningPoints, setLearningPoints] = useState<string[]>([]);
  const [fullTranslationZh, setFullTranslationZh] = useState('');
  const [analysisStatus, setAnalysisStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [analysisError, setAnalysisError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const hasAnalyzedRef = useRef(false);

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

    void runAnalysis();
  }, [articleText]);

  async function runAnalysis() {
    setAnalysisStatus('loading');
    setAnalysisError('');

    try {
      const result = await analyzeArticle({
        title: articleTitle || '未命名文章',
        content: articleText,
        highlights,
      });

      setLearningPoints(result.learningPoints);
      setFullTranslationZh(result.fullTranslationZh);
      replaceHighlights(
        highlights.map((highlight, index) => ({
          ...highlight,
          ...result.cards[index],
        })),
      );
      setAnalysisStatus('success');
    } catch (error) {
      setAnalysisStatus('error');
      setAnalysisError(error instanceof Error ? error.message : '总结生成失败');
    }
  }

  async function handleSaveToLibrary() {
    if (analysisStatus !== 'success') {
      return;
    }

    setIsSaving(true);
    const articleId = Date.now().toString();
    const createdAt = Date.now();
    const newArticle: Article = {
      id: articleId,
      title: articleTitle || '未命名文章',
      content: articleText,
      learningPoints,
      fullTranslationZh,
      createdAt,
    };

    const newCards: Card[] = highlights.map((h) => ({
      ...h,
      articleId,
      createdAt,
    }));

    try {
      await createArticle({
        ...newArticle,
        cards: newCards,
      });

      saveToLibrary(newArticle, newCards);
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
            className="bg-stone-100 hover:bg-stone-200 text-stone-700 px-4 py-2 rounded-full text-sm font-medium transition-colors hidden sm:flex items-center space-x-2"
          >
            <Download className="w-4 h-4" />
            <span>导出 PDF</span>
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
            <p className="text-sm text-stone-500">正在调用 DeepSeek 生成总结，请稍候...</p>
          </section>
        )}

        {analysisStatus === 'error' && (
          <section className="bg-red-50 rounded-2xl p-6 shadow-sm border border-red-100 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-red-700">总结生成失败</p>
              <p className="text-sm text-red-600 mt-1">{analysisError}</p>
            </div>
            <button
              onClick={() => void runAnalysis()}
              className="bg-white hover:bg-red-100 text-red-700 border border-red-200 px-4 py-2 rounded-xl text-sm font-medium transition-colors"
            >
              重试
            </button>
          </section>
        )}

        <section className="bg-white rounded-2xl shadow-sm border border-stone-100 overflow-hidden">
          <button
            onClick={() => setIsOriginalOpen(!isOriginalOpen)}
            className="w-full px-6 py-4 flex items-center justify-between bg-stone-50 hover:bg-stone-100 transition-colors"
          >
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-full bg-stone-200 flex items-center justify-center text-stone-600 font-bold text-sm">O</div>
              <h2 className="text-lg font-semibold text-stone-800">俄语原文</h2>
            </div>
            {isOriginalOpen ? <ChevronUp className="w-5 h-5 text-stone-500" /> : <ChevronDown className="w-5 h-5 text-stone-500" />}
          </button>

          {isOriginalOpen && (
            <div className="p-6 border-t border-stone-100">
              <p className="text-stone-700 leading-relaxed text-lg font-serif whitespace-pre-wrap">
                {articleText}
              </p>
            </div>
          )}
        </section>

        <section className="bg-white rounded-2xl p-6 shadow-sm border border-stone-100">
          <div className="flex items-center space-x-2 mb-4">
            <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 font-bold text-sm">A</div>
            <h2 className="text-lg font-semibold text-stone-800">本篇学习提要</h2>
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
              <h2 className="text-lg font-semibold text-stone-800">全文翻译</h2>
            </div>
            {isTranslationOpen ? <ChevronUp className="w-5 h-5 text-stone-500" /> : <ChevronDown className="w-5 h-5 text-stone-500" />}
          </button>

          {isTranslationOpen && (
            <div className="p-6 border-t border-stone-100">
              <p className="text-stone-600 leading-relaxed text-sm">
                {fullTranslationZh || '等待生成全文翻译...'}
              </p>
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
              <p className="text-stone-500">暂无划线卡片，返回阅读页添加一些吧！</p>
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
                    <button
                      onClick={() => updateHighlight(card.id, {isImportant: !card.isImportant})}
                      className={`p-2 rounded-full transition-colors ${card.isImportant ? 'bg-amber-100 text-amber-500' : 'bg-stone-100 text-stone-400 hover:bg-stone-200'}`}
                    >
                      <Star className={`w-4 h-4 ${card.isImportant ? 'fill-current' : ''}`} />
                    </button>
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
    </div>
  );
}
