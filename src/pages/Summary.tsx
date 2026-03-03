import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore, Article, Card } from '../store';
import { ChevronLeft, Download, ChevronDown, ChevronUp, Star, Save } from 'lucide-react';

const MOCK_LEARNING_POINTS = [
  "гулять по парку (在公园散步) - 常用搭配，注意前置词 по + 查词格",
  "замечательная погода (极好的天气) - 形容词与名词的性数格一致",
  "наслаждаться моментом (享受当下) - наслаждаться 要求接第五格 (造句格)",
  "никуда не спешить (哪儿也不急着去) - 双重否定表达",
  "который час (几点了) - 询问时间的固定句型"
];

const MOCK_FULL_TRANSLATION = `昨天我在公园散步，看到了一只美丽的鸟。它坐在树枝上唱着歌。天气极好，阳光明媚，吹着微风。我决定坐在长椅上看书。那是那种你只想享受当下、哪儿也不急着去的日子之一。突然，一个小男孩走到我面前，问我几点了。我笑了笑，回答了他。这些简单的瞬间让我们的生活真正变得幸福。`;

export default function Summary() {
  const navigate = useNavigate();
  const { articleTitle, articleText, highlights, updateHighlight, saveToLibrary, clearHighlights, setArticle } = useStore();
  const [isOriginalOpen, setIsOriginalOpen] = useState(false);
  const [isTranslationOpen, setIsTranslationOpen] = useState(false);

  const handleSaveToLibrary = () => {
    const articleId = Date.now().toString();
    const newArticle: Article = {
      id: articleId,
      title: articleTitle || '未命名文章',
      content: articleText,
      learningPoints: MOCK_LEARNING_POINTS,
      fullTranslationZh: MOCK_FULL_TRANSLATION,
      createdAt: Date.now(),
    };

    const newCards: Card[] = highlights.map((h) => ({
      ...h,
      articleId,
      createdAt: Date.now(),
    }));

    saveToLibrary(newArticle, newCards);
    clearHighlights();
    setArticle('', '');
    navigate('/library');
  };

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 font-sans pb-20">
      {/* Top Bar */}
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
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-full text-sm font-medium transition-colors shadow-sm flex items-center space-x-2"
          >
            <Save className="w-4 h-4" />
            <span>保存到知识库</span>
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        
        {/* Section: Original Text */}
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

        {/* Section A: Learning Points */}
        <section className="bg-white rounded-2xl p-6 shadow-sm border border-stone-100">
          <div className="flex items-center space-x-2 mb-4">
            <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 font-bold text-sm">A</div>
            <h2 className="text-lg font-semibold text-stone-800">本篇学习提要</h2>
          </div>
          <ul className="space-y-3">
            {MOCK_LEARNING_POINTS.map((point, idx) => (
              <li key={idx} className="flex items-start space-x-3 text-stone-600 text-sm leading-relaxed">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-2 flex-shrink-0"></span>
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Section B: Full Translation */}
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
                {MOCK_FULL_TRANSLATION}
              </p>
            </div>
          )}
        </section>

        {/* Section C: Cards */}
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
                  
                  {/* Card Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <p className="text-xs font-medium text-stone-400 uppercase tracking-wider mb-1">原文</p>
                      <h3 className="text-lg font-semibold text-stone-900 font-serif">{card.originalText}</h3>
                    </div>
                    <button 
                      onClick={() => updateHighlight(card.id, { isImportant: !card.isImportant })}
                      className={`p-2 rounded-full transition-colors ${card.isImportant ? 'bg-amber-100 text-amber-500' : 'bg-stone-100 text-stone-400 hover:bg-stone-200'}`}
                    >
                      <Star className={`w-4 h-4 ${card.isImportant ? 'fill-current' : ''}`} />
                    </button>
                  </div>

                  {/* Card Fields */}
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-stone-500 mb-1">原型</label>
                      <input 
                        type="text" 
                        value={card.lemma}
                        onChange={(e) => updateHighlight(card.id, { lemma: e.target.value })}
                        placeholder="如: делать / сделать"
                        className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-xs font-medium text-stone-500 mb-1">中文</label>
                      <input 
                        type="text" 
                        value={card.translationZh}
                        onChange={(e) => updateHighlight(card.id, { translationZh: e.target.value })}
                        className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-stone-500 mb-1">核心用法</label>
                      <input 
                        type="text" 
                        value={card.usageNote}
                        onChange={(e) => updateHighlight(card.id, { usageNote: e.target.value })}
                        placeholder="一句话简明用法"
                        className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-stone-500 mb-1">例句</label>
                      <textarea 
                        value={card.example}
                        onChange={(e) => updateHighlight(card.id, { example: e.target.value })}
                        placeholder="输入例句..."
                        rows={2}
                        className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all resize-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-stone-500 mb-1">备注</label>
                      <textarea 
                        value={card.note}
                        onChange={(e) => updateHighlight(card.id, { note: e.target.value })}
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
