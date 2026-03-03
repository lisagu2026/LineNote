import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { CheckCircle2, ArrowLeft, Sparkles } from 'lucide-react';

export default function Confirm() {
  const navigate = useNavigate();
  const { highlights } = useStore();

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4 font-sans">
      <div className="bg-white max-w-md w-full rounded-3xl shadow-sm border border-stone-200 p-8 text-center">
        <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 className="w-8 h-8" />
        </div>
        
        <h1 className="text-2xl font-semibold text-stone-900 mb-2">你已完成阅读</h1>
        <p className="text-stone-500 mb-8">
          本篇划线：<span className="font-semibold text-emerald-600 text-lg">{highlights.length}</span> 条
        </p>

        <div className="bg-stone-50 rounded-2xl p-6 mb-8 border border-stone-100">
          <p className="text-sm text-stone-600 mb-4">是否根据划线生成学习总结？</p>
          <div className="flex items-center justify-center space-x-2 text-xs text-stone-400">
            <Sparkles className="w-4 h-4" />
            <span>AI 将自动提取核心用法并生成卡片</span>
          </div>
        </div>

        <div className="space-y-3">
          <button
            onClick={() => navigate('/summary')}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3.5 rounded-xl font-medium transition-colors shadow-sm flex items-center justify-center space-x-2"
          >
            <Sparkles className="w-5 h-5" />
            <span>开始生成总结</span>
          </button>
          
          <button
            onClick={() => navigate('/reader')}
            className="w-full bg-white hover:bg-stone-50 text-stone-600 border border-stone-200 py-3.5 rounded-xl font-medium transition-colors flex items-center justify-center space-x-2"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>返回继续读</span>
          </button>
        </div>
      </div>
    </div>
  );
}
