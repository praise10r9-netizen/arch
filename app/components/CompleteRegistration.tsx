'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import '../styles/auth.css';

export default function CompleteRegistration({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setIsLoading(true);
    try {
      const response = await fetch('/api/auth/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const result = (await response.json()) as { message?: string; user?: { id: string } };
      if (!response.ok || !result.user) throw new Error(result.message || 'Unable to activate account.');
      router.replace('/trainee');
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to activate account.');
      setIsLoading(false);
    }
  }

  return (
    <div className="auth-wrapper">
      <main className="form-container">
        <Link className="auth-brand" href="/" aria-label="Arch home">
          <span className="auth-brand-mark" aria-hidden="true">A</span>
          <span>ARCH</span>
        </Link>
        <div className="form-header">
          <p className="form-eyebrow">UNIVERSITY VERIFIED</p>
          <h1>Complete your account</h1>
          <p className="form-description">Set a password to activate your verified account and sign in.</p>
        </div>
        {!token && <div className="form-error" role="alert">This invitation link is missing or invalid.</div>}
        {error && <div className="form-error" role="alert">{error}</div>}
        {token && <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="new-password">Password</label>
            <input autoComplete="new-password" className="form-input" disabled={isLoading}
              id="new-password" minLength={12} onChange={(event) => setPassword(event.target.value)}
              required type="password" value={password} />
            <p className="auth-hint">Use at least 12 characters.</p>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="confirm-password">Confirm password</label>
            <input autoComplete="new-password" className="form-input" disabled={isLoading}
              id="confirm-password" onChange={(event) => setConfirmPassword(event.target.value)}
              required type="password" value={confirmPassword} />
          </div>
          <button className="form-button" disabled={isLoading} type="submit">
            {isLoading ? 'Activating…' : 'Activate and sign in'}
          </button>
        </form>}
        <div className="form-footer"><Link href="/login">Return to sign in</Link></div>
      </main>
    </div>
  );
}