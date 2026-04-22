import React, { useState } from 'react';

const VALID_USERNAME = import.meta.env.VITE_LOGIN_USERNAME || 'investor';
const VALID_PASSWORD = import.meta.env.VITE_LOGIN_PASSWORD || 'Univest@2024';

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setTimeout(() => {
      if (username === VALID_USERNAME && password === VALID_PASSWORD) {
        localStorage.setItem('mis_auth', btoa(`${username}:${Date.now()}`));
        onLogin();
      } else {
        setError('Invalid username or password');
      }
      setLoading(false);
    }, 400);
  };

  return (
    <div className="min-h-screen bg-[#0a1628] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <img src="/favicon.png" alt="Univest" className="w-14 h-14 rounded-xl bg-white object-contain p-1 mb-3 shadow-lg" />
          <h1 className="text-white text-xl font-bold tracking-tight">Univest MIS</h1>
          <p className="text-gray-400 text-sm mt-1">Investor Dashboard</p>
        </div>

        {/* Card */}
        <div className="bg-[#0f1f3d] rounded-2xl border border-white/10 p-8 shadow-2xl">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Username</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="Enter username"
                autoComplete="username"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-[#185FA5] focus:ring-1 focus:ring-[#185FA5] transition-colors"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter password"
                autoComplete="current-password"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-[#185FA5] focus:ring-1 focus:ring-[#185FA5] transition-colors"
                required
              />
            </div>

            {error && (
              <p className="text-red-400 text-xs text-center">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#185FA5] hover:bg-[#1a6bbf] disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold text-sm py-2.5 rounded-lg transition-colors"
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        </div>

        <p className="text-center text-gray-600 text-xs mt-6">Univest MIS · Confidential</p>
      </div>
    </div>
  );
}
