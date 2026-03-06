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
    <div className="min-h-screen bg-stone-100 text-stone-900 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-4xl grid gap-6 md:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-[32px] bg-gradient-to-br from-emerald-700 via-emerald-600 to-lime-500 p-8 text-white shadow-xl">
          <p className="text-sm uppercase tracking-[0.28em] text-white/70">LineNote</p>
          <h1 className="mt-6 text-4xl font-semibold leading-tight">把俄语精读、划线和总结，收进同一个工作流。</h1>
          <p className="mt-5 max-w-xl text-sm leading-7 text-white/85">
            登录后，你的文章、卡片和总结会归属于自己的账号。后续上线正式环境时，数据可以直接延续，不再需要测试隔离链接。
          </p>
        </section>

        <section className="rounded-[32px] bg-white p-8 shadow-xl border border-stone-200">
          <div className="inline-flex rounded-full bg-stone-100 p-1 text-sm">
            <button
              onClick={() => setMode('login')}
              className={`rounded-full px-4 py-2 transition-colors ${mode === 'login' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500'}`}
              type="button"
            >
              登录
            </button>
            <button
              onClick={() => setMode('register')}
              className={`rounded-full px-4 py-2 transition-colors ${mode === 'register' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500'}`}
              type="button"
            >
              注册
            </button>
          </div>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {mode === 'register' && (
              <div>
                <label className="mb-1 block text-sm text-stone-600">昵称</label>
                <input
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  className="w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 outline-none transition focus:border-emerald-500 focus:bg-white"
                  placeholder="例如 Lisa"
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
    </div>
  );
}
