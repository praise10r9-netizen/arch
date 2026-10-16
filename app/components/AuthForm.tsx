'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import '../styles/auth.css';

interface AuthFormProps {
  mode: 'login' | 'register';
}

interface AuthResponse {
  user?: {
    role: 'trainee' | 'qualified_architect' | 'university_admin' | 'board_admin';
    universityAdmin?: boolean;
    boardAdmin?: boolean;
  };
  applicationSubmitted?: boolean;
  universityAdminCreated?: boolean;
  message?: string;
}

export default function AuthForm({ mode }: AuthFormProps) {
  const isLogin = mode === 'login';
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [registrationType, setRegistrationType] = useState<'trainee' | 'university_admin'>('trainee');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [programType, setProgramType] = useState<'student_attachment' | 'graduate_training'>('student_attachment');
  const [formError, setFormError] = useState('');
  const [submittedMessage, setSubmittedMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const isUniversitySignup = !isLogin && registrationType === 'university_admin';

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError('');
    setIsLoading(true);
    try {
      const response = await fetch(isLogin ? '/api/auth/login' : '/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          isLogin
            ? { email, password }
            : isUniversitySignup
              ? { name, email, password, role: 'university_admin' }
              : { name, email, registrationNumber, programType, role: 'trainee' },
        ),
      });
      const result = (await response.json()) as AuthResponse;
      if (!response.ok) {
        throw new Error(result.message || 'Authentication failed.');
      }
      if (result.applicationSubmitted) {
        setSubmittedMessage(result.message || 'Request submitted for university verification.');
        setIsLoading(false);
        return;
      }
      if (result.universityAdminCreated) {
        setSubmittedMessage(result.message || 'Your account is ready. Sign in to set up your university workspace.');
        setIsLoading(false);
        return;
      }
      if (!result.user) throw new Error(result.message || 'Authentication failed.');
      router.replace(
        result.user.boardAdmin
          ? '/board-admin'
          : result.user.universityAdmin
          ? '/university-admin'
          : result.user.role === 'qualified_architect'
            ? '/architect'
            : '/trainee',
      );
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
          <p className="form-eyebrow">{isLogin ? 'MEMBER ACCESS' : isUniversitySignup ? 'UNIVERSITY ADMINISTRATION' : 'UNIVERSITY VERIFICATION'}</p>
          <h1>{isLogin ? 'Welcome back' : isUniversitySignup ? 'Create administrator account' : 'Request access'}</h1>
          <p className="form-description">
            {isLogin
              ? 'Sign in to continue to your account.'
              : isUniversitySignup
                ? 'Create your university administrator account with your school email. After signing in, you will set up and manage only your own university workspace.'
                : 'Use your .ac.mw school email. Roster matches get an activation link automatically; exceptions go to manual review.'}
          </p>
        </div>

        {submittedMessage && <div className="success-message" role="status">{submittedMessage}</div>}
        {formError && <div className="form-error" role="alert">{formError}</div>}

        {!submittedMessage && <form onSubmit={handleSubmit}>
          {!isLogin && <div className="form-group">
            <label className="form-label" htmlFor="registration-type">Account type</label>
            <select
              className="form-input"
              disabled={isLoading}
              id="registration-type"
              onChange={(event) => setRegistrationType(event.target.value === 'university_admin' ? 'university_admin' : 'trainee')}
              value={registrationType}
            >
              <option value="trainee">Student or graduate</option>
              <option value="university_admin">University administrator</option>
            </select>
          </div>}

          {!isLogin && (
            <div className="form-group">
              <label htmlFor="name" className="form-label">{isUniversitySignup ? 'Administrator full name' : 'Full name'}</label>
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

          {!isLogin && !isUniversitySignup && (
            <>
              <div className="form-group">
                <label htmlFor="registration-number" className="form-label">University registration number</label>
                <input
                  autoComplete="off"
                  className="form-input"
                  disabled={isLoading}
                  id="registration-number"
                  maxLength={80}
                  onChange={(event) => setRegistrationNumber(event.target.value)}
                  required
                  value={registrationNumber}
                />
              </div>
              <div className="form-group">
                <label htmlFor="program-type" className="form-label">University program</label>
                <select
                  className="form-input"
                  disabled={isLoading}
                  id="program-type"
                  onChange={(event) => setProgramType(event.target.value as typeof programType)}
                  value={programType}
                >
                  <option value="student_attachment">Student attachment</option>
                  <option value="graduate_training">Two-year graduate training</option>
                </select>
              </div>
            </>
          )}

          <div className="form-group">
            <label htmlFor="email" className="form-label">{isUniversitySignup ? 'University email address' : isLogin ? 'Email address' : 'School email address'}</label>
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

          {(isLogin || isUniversitySignup) && <div className="form-group">
            <label htmlFor="password" className="form-label">{isLogin ? 'Password' : 'Create password'}</label>
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
            {isUniversitySignup && <p className="auth-hint">At least 12 characters.</p>}
          </div>}

          <button className="form-button" disabled={isLoading} type="submit">
            {isLoading ? 'Please wait…' : isLogin ? 'Sign in' : isUniversitySignup ? 'Create administrator account' : 'Submit for verification'}
          </button>
        </form>}

        <div className="form-footer">
          <span>{isLogin ? "Don't have an account?" : 'Already have access?'}</span>{' '}
          <Link href={isLogin ? '/register' : '/login'}>
            {isLogin ? 'Create an account' : 'Sign in'}
          </Link>
        </div>
      </main>
    </div>
  );
}
