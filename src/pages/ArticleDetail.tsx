import React, {useEffect, useState} from 'react';
import {useNavigate, useParams} from 'react-router-dom';
import {getSentenceTranslations} from '../lib/api';
import {useStore} from '../store';
import {ChevronLeft, Download, ChevronDown, ChevronUp, Star, Trash2} from 'lucide-react';

export default function ArticleDetail() {
  const {id} = useParams<{id: string}>();
  const navigate = useNavigate();
  const {articles, cards, updateCard, removeCard, setArticle, replaceHighlights, setActiveArticleId, setSummaryDraft} = useStore();
  const [deleteCardId, setDeleteCardId] = useState<string | null>(null);
  const [sentencePairs, setSentencePairs] = useState<Array<{source: string; translationZh: string}>>([]);
  const [showTranslation, setShowTranslation] = useState(true);

  const article = articles.find((a) => a.id === id);
  const articleCards = cards
    .filter((c) => c.articleId === id)
    .sort((a, b) => Number(b.isImportant) - Number(a.isImportant));

  const [isTranslationOpen, setIsTranslationOpen] = useState(true);
  const [isPointsOpen, setIsPointsOpen] = useState(true);

  function handleExportPdf() {
    window.alert('导出 PDF 功能暂未上线');
  }

  function handleContinueReading() {
    if (!article) return;
    const sessionHighlights = cards
      .filter((c) => c.articleId === article.id)
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
    setArticle(article.title, article.content);
    setActiveArticleId(article.id);
    setSummaryDraft({
      articleTitle: article.title,
      articleText: article.content,
      learningPoints: article.learningPoints,
      fullTranslationZh: article.fullTranslationZh,
    });
    replaceHighlights(sessionHighlights);
    navigate('/reader?resume=1');
  }

  useEffect(() => {
    if (!article?.content) {
      return;
    }

    void getSentenceTranslations({content: article.content})
      .then((result) => {
        setSentencePairs(result.items);
      })
      .catch(() => {
        setSentencePairs([]);
      });
  }, [article?.content]);

  if (!article) {
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
            {article.title}
          </h1>
        </div>
        <button
          onClick={handleExportPdf}
          className="bg-stone-100 hover:bg-stone-200 text-stone-700 px-4 py-2 rounded-full text-sm font-medium transition-colors flex items-center space-x-2"
        >
          <Download className="w-4 h-4" />
          <span className="hidden sm:inline">导出 PDF</span>
        </button>
        <button
          onClick={handleContinueReading}
          className="bg-white hover:bg-stone-50 text-stone-700 border border-stone-200 px-4 py-2 rounded-full text-sm font-medium transition-colors"
        >
          返回继续划线
        </button>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">
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
              <ul className="space-y-3">
                {article.learningPoints.map((point, idx) => (
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
                {(sentencePairs.length ? sentencePairs : [{source: article.content, translationZh: article.fullTranslationZh}]).map((pair, idx) => (
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
            <h2 className="text-lg font-semibold text-stone-800">卡片区 ({articleCards.length})</h2>
          </div>

          {articleCards.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center border border-stone-100 border-dashed">
              <p className="text-stone-500">该文章暂无卡片</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {articleCards.map((card) => (
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
                        onClick={() => updateCard(card.id, {isImportant: !card.isImportant})}
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
                        onChange={(e) => updateCard(card.id, {lemma: e.target.value})}
                        placeholder="如: делать / сделать"
                        className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-stone-500 mb-1">中文</label>
                      <input
                        type="text"
                        value={card.translationZh}
                        onChange={(e) => updateCard(card.id, {translationZh: e.target.value})}
                        className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-stone-500 mb-1">核心用法</label>
                      <input
                        type="text"
                        value={card.usageNote}
                        onChange={(e) => updateCard(card.id, {usageNote: e.target.value})}
                        placeholder="一句话简明用法"
                        className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-stone-500 mb-1">例句</label>
                      <textarea
                        value={card.example}
                        onChange={(e) => updateCard(card.id, {example: e.target.value})}
                        placeholder="输入例句..."
                        rows={2}
                        className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all resize-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-stone-500 mb-1">备注</label>
                      <textarea
                        value={card.note}
                        onChange={(e) => updateCard(card.id, {note: e.target.value})}
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
                  removeCard(deleteCardId);
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
