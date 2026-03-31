import React, { useState } from 'react';

interface LocalAuthGateProps {
  needsSetup: boolean;
  loading: boolean;
  error: string | null;
  onRegister: (email: string, displayName: string, password: string) => Promise<void>;
  onLogin: (email: string, password: string) => Promise<void>;
}

export const LocalAuthGate: React.FC<LocalAuthGateProps> = ({
  needsSetup,
  loading,
  error,
  onRegister,
  onLogin,
}) => {
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (needsSetup) {
      await onRegister(email.trim(), displayName.trim(), password);
      return;
    }
    await onLogin(email.trim(), password);
  };

  return (
    <div className="min-h-screen bg-[#0b1217] text-[#f7efe8] flex items-center justify-center px-6">
      <form onSubmit={handleSubmit} className="w-full max-w-md rounded-[28px] border border-white/10 bg-white/5 p-8 space-y-5">
        <div>
          <div className="text-xs uppercase tracking-[0.22em] text-white/45">Roclaw</div>
          <h1 className="mt-3 text-3xl font-semibold">{needsSetup ? '创建本地账号' : '本地登录'}</h1>
          <p className="mt-2 text-sm text-white/60">
            {needsSetup ? '首次使用，先创建一个本地账号。' : '使用本地账号进入桌面端。'}
          </p>
        </div>

        <label className="block space-y-2">
          <span className="text-sm text-white/75">邮箱</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none"
            required
          />
        </label>

        {needsSetup && (
          <label className="block space-y-2">
            <span className="text-sm text-white/75">显示名称</span>
            <input
              type="text"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none"
              required
            />
          </label>
        )}

        <label className="block space-y-2">
          <span className="text-sm text-white/75">密码</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none"
            required
          />
        </label>

        {error && <div className="text-sm text-[#fda4af]">{error}</div>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-2xl bg-[linear-gradient(135deg,#2563eb,#0ea5e9)] px-4 py-3 text-sm font-semibold disabled:opacity-60"
        >
          {loading ? '处理中...' : needsSetup ? '创建并进入' : '登录'}
        </button>
      </form>
    </div>
  );
};
