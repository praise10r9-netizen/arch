'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import '../styles/auth.css';

interface AuthFormProps {
  mode: 'login' | 'register';
}

interface AuthResponse {
  user?: { role: 'trainee' | 'mentor' };
  message?: string;
}

export default function AuthForm({ mode }: AuthFormProps) {
  const isLogin = mode === 'login';
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [registerAsMentor, setRegisterAsMentor] = useState(false);
  const [formError, setFormError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError('');
    if (!isLogin && password !== confirmPassword) {
      setFormError('Passwords do not match.');
      return;
    }
    if (!isLogin && password.length < 12) {
      setFormError('Choose a password with at least 12 characters.');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(isLogin ? '/api/auth/login' : '/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          isLogin
            ? { email, password }
            : {
                name,
                email,
                password,
                role: registerAsMentor ? 'mentor' : 'trainee',
              },
        ),
      });
      const result = (await response.json()) as AuthResponse;
      if (!response.ok || !result.user) {
        throw new Error(result.message || 'Authentication failed.');
      }
      router.replace(result.user.role === 'mentor' ? '/mentor' : '/trainee');
      router.refresh();
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : 'Unable to complete authentication.',
      );
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
          <p className="form-eyebrow">{isLogin ? 'MEMBER ACCESS' : 'GET STARTED'}</p>
          <h1>{isLogin ? 'Welcome back' : 'Create your account'}</h1>
          <p className="form-description">
            {isLogin
              ? 'Sign in to continue to your account.'
              : 'Create an account to start your professional journey.'}
          </p>
        </div>

        {formError && <div className="form-error" role="alert">{formError}</div>}

        <form onSubmit={handleSubmit}>
          {!isLogin && (
            <div className="form-group">
              <label htmlFor="name" className="form-label">Full name</label>
              <input
                autoComplete="name"
                className="form-input"
                disabled={isLoading}
                id="name"
                maxLength={120}
                onChange={(event) => setName(event.target.value)}
                required
                value={name}
              />
            </div>
          )}

          <div className="form-group">
            <label htmlFor="email" className="form-label">Email address</label>
            <input
              autoComplete="email"
              className="form-input"
              disabled={isLoading}
              id="email"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </div>

          <div className="form-group">
            <label htmlFor="password" className="form-label">Password</label>
            <input
              autoComplete={isLogin ? 'current-password' : 'new-password'}
              className="form-input"
              disabled={isLoading}
              id="password"
              minLength={isLogin ? undefined : 12}
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
            {!isLogin && <p className="auth-hint">Use at least 12 characters.</p>}
          </div>

          {!isLogin && (
            <>
              <div className="form-group">
                <label htmlFor="confirm-password" className="form-label">
                  Confirm password
                </label>
                <input
                  autoComplete="new-password"
                  className="form-input"
                  disabled={isLoading}
                  id="confirm-password"
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                  type="password"
                  value={confirmPassword}
                />
              </div>
              <label className="mentor-registration-option">
                <input
                  checked={registerAsMentor}
                  disabled={isLoading}
                  onChange={(event) => setRegisterAsMentor(event.target.checked)}
                  type="checkbox"
                />
                <span>
                  <strong>Would you like to register as a mentor?</strong>
                  <small>Leave this unchecked to create a trainee account.</small>
                </span>
              </label>
            </>
          )}

          <button className="form-button" disabled={isLoading} type="submit">
            {isLoading ? 'Please wait…' : isLogin ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <div className="form-footer">
          <span>{isLogin ? "Don't have an account?" : 'Already have an account?'}</span>{' '}
          <Link href={isLogin ? '/register' : '/login'}>
            {isLogin ? 'Create an account' : 'Sign in'}
          </Link>
        </div>
      </main>
    </div>
  );
}
