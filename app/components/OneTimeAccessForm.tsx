'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import '../styles/auth.css';

interface OneTimeAccessFormProps {
  token: string;
  mode: 'architect-activation' | 'training-invitation';
}

export default function OneTimeAccessForm({ token, mode }: OneTimeAccessFormProps) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const isActivation = mode === 'architect-activation';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (!token) {
      setError('This link is missing its secure token.');
      return;
    }
    if (isActivation && password !== confirmation) {
      setError('The passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(
        isActivation ? '/api/qualified-architect/activate' : '/api/training-invitation/accept',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, password }),
        },
      );
      const result = await response.json() as { message?: string; accepted?: boolean };
      if (!response.ok) throw new Error(result.message || 'Unable to complete this request.');
      if (isActivation) {
        router.replace('/architect');
        router.refresh();
      } else {
        setMessage(result.message || 'Invitation accepted.');
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to complete this request.');
    } finally {
      setLoading(false);
    }
  }

  return <div className="auth-wrapper">
    <main className="form-container">
      <Link className="auth-brand" href="/" aria-label="ArchPath home">
        <span className="auth-brand-mark" aria-hidden="true">A</span><span>ARCH</span>
      </Link>
      <div className="form-header">
        <p className="form-eyebrow">{isActivation ? 'QUALIFIED ARCHITECT' : 'TRAINING RELATIONSHIP'}</p>
        <h1>{isActivation ? 'Activate your account' : 'Accept architect invitation'}</h1>
        <p className="form-description">
          {isActivation
            ? 'Choose a password to activate your Board of Architects account.'
            : 'Confirm with your graduate trainee account password. Your logs will be shared with the inviting architect after acceptance.'}
        </p>
      </div>
      {error && <div className="form-error" role="alert">{error}</div>}
      {message ? <div className="success-message" role="status">{message}</div> : <form onSubmit={submit}>
        <div className="form-group">
          <label className="form-label" htmlFor="access-password">
            {isActivation ? 'New password' : 'Trainee account password'}
          </label>
          <input
            autoComplete={isActivation ? 'new-password' : 'current-password'}
            className="form-input"
            disabled={loading}
            id="access-password"
            minLength={isActivation ? 12 : 1}
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
        </div>
        {isActivation && <div className="form-group">
          <label className="form-label" htmlFor="access-confirmation">Confirm password</label>
          <input
            autoComplete="new-password"
            className="form-input"
            disabled={loading}
            id="access-confirmation"
            minLength={12}
            onChange={(event) => setConfirmation(event.target.value)}
            required
            type="password"
            value={confirmation}
          />
        </div>}
        <button className="button button-primary auth-submit" disabled={loading} type="submit">
          {loading ? 'Please wait…' : isActivation ? 'Activate account' : 'Accept invitation'}
        </button>
      </form>}
    </main>
  </div>;
}
