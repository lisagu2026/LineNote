import React, { useState, useTransition } from 'react';
import { useNavigate } from 'react-router-dom';
import { login, register } from '../lib/api';
import { useStore } from '../store';

export default function Auth() {
  const navigate = useNavigate();
  const setAuthSession = useStore((state) => state.setAuthSession);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    startTransition(() => {
      const action = mode === 'register'
        ? register({displayName, email, password})
        : login({email, password});

      void action
        .then((result) => {
          setAuthSession(result.user, result.token);
          navigate('/library', {replace: true});
        })
        .catch((submitError) => {
          setError(submitError instanceof Error ? submitError.message : '操作失败');
        });
    });
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#e8fff4_0%,_#f6f3ee_42%,_#efe7dc_100%)] text-stone-900 flex items-center justify-center px-4 py-10">
      <section className="w-full max-w-md rounded-[28px] border border-stone-200/80 bg-white/90 p-8 shadow-[0_24px_80px_rgba(30,41,59,0.12)] backdrop-blur">
        <div className="mb-6">
          <p className="text-xs uppercase tracking-[0.32em] text-emerald-700/80">LineNote</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-stone-900">
            {mode === 'login' ? '登录' : '创建账号'}
          </h1>
          <p className="mt-2 text-sm text-stone-500">
            {mode === 'login' ? '继续你的精读和卡片。' : '注册后开始保存文章和总结。'}
          </p>
        </div>

        <div className="inline-flex w-full rounded-2xl bg-stone-100 p-1 text-sm mb-6">
          <button
            onClick={() => setMode('login')}
            className={`flex-1 rounded-xl px-4 py-2 transition-colors ${mode === 'login' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500'}`}
            type="button"
          >
            登录
          </button>
          <button
            onClick={() => setMode('register')}
            className={`flex-1 rounded-xl px-4 py-2 transition-colors ${mode === 'register' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500'}`}
            type="button"
          >
            注册
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'register' && (
            <div>
              <label className="mb-1 block text-sm text-stone-600">昵称</label>
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                className="w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 outline-none transition focus:border-emerald-500 focus:bg-white"
                placeholder="你的名字"
              />
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm text-stone-600">邮箱</label>
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              autoComplete="email"
              className="w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 outline-none transition focus:border-emerald-500 focus:bg-white"
              placeholder="you@example.com"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-stone-600">密码</label>
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              className="w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 outline-none transition focus:border-emerald-500 focus:bg-white"
              placeholder="至少 8 位"
              required
            />
          </div>

          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="w-full rounded-2xl bg-stone-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-400"
          >
            {isPending ? '提交中...' : mode === 'login' ? '登录' : '创建账号'}
          </button>
        </form>
      </section>
    </div>
  );
}
