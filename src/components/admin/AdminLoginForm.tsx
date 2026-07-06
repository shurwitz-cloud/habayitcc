'use client';

import { useState } from 'react';
import Link from 'next/link';

const DEFAULT_ADMIN_EMAIL = 'info@habayitcc.org';

export function AdminLoginForm({
  title,
  description,
  alternateLink,
}: {
  title: string;
  description: string;
  alternateLink?: { href: string; label: string };
}) {
  const [email, setEmail] = useState(DEFAULT_ADMIN_EMAIL);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const res = await fetch('/api/admin/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    setLoading(false);
    if (!res.ok) {
      setError('Invalid email or password.');
      return;
    }
    window.location.reload();
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-md mx-auto bg-white border border-line rounded-2xl p-8">
      <h1 className="text-2xl font-bold text-navy mb-2">{title}</h1>
      <p className="text-muted text-sm mb-6">{description}</p>

      <label className="block text-[0.78rem] font-bold uppercase tracking-wide text-navy mb-1.5">
        Email
      </label>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full mb-4"
        required
        autoComplete="username"
        inputMode="email"
      />

      <label className="block text-[0.78rem] font-bold uppercase tracking-wide text-navy mb-1.5">
        Password
      </label>
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="w-full mb-4"
        required
        autoComplete="current-password"
      />

      {error && <p className="text-danger text-sm mb-3">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-gold text-white rounded-full py-3 font-bold uppercase tracking-wider disabled:opacity-60"
      >
        {loading ? 'Signing in…' : 'Sign in'}
      </button>

      {alternateLink && (
        <p className="text-center text-xs text-muted mt-4">
          <Link href={alternateLink.href} className="underline">
            {alternateLink.label}
          </Link>
        </p>
      )}
    </form>
  );
}
