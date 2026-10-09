// Enhanced AuthForm Example - Additional Features
// This file shows you how to extend the basic AuthForm component

import { useState } from 'react';

// ============================================================
// EXAMPLE 1: Adding "Remember Me" Checkbox
// ============================================================

export function AuthFormWithRememberMe() {
  const [rememberMe, setRememberMe] = useState(false);

  // Add to form:
  // <div className="form-group">
  //   <label className="form-label">
  //     <input
  //       type="checkbox"
  //       checked={rememberMe}
  //       onChange={(e) => setRememberMe(e.target.checked)}
  //     />
  //     Remember me
  //   </label>
  // </div>

  // In API call, include:
  // const payload = {
  //   email: formData.email,
  //   password: formData.password,
  //   rememberMe: rememberMe,
  // };
}

// ============================================================
// EXAMPLE 2: Adding Social Login Buttons
// ============================================================

export function AuthFormWithSocialLogin() {
  // Add this CSS to app/styles/auth.css:
  /*
  .social-login-container {
    display: flex;
    gap: 1rem;
    margin-bottom: 1.5rem;
  }

  .social-button {
    flex: 1;
    padding: 0.75rem;
    background: white;
    color: #333333;
    border: none;
    border-radius: 6px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s ease;
  }

  .social-button:hover {
    background: #f0f0f0;
    transform: translateY(-2px);
  }

  .social-button svg {
    width: 20px;
    height: 20px;
    margin-right: 0.5rem;
  }
  */

  // Add to form JSX:
  // <div className="social-login-container">
  //   <button type="button" className="social-button">
  //     Google
  //   </button>
  //   <button type="button" className="social-button">
  //     GitHub
  //   </button>
  // </div>
}

// ============================================================
// EXAMPLE 3: Adding Email Verification
// ============================================================

export function AuthFormWithEmailVerification() {
  const [verificationCode, setVerificationCode] = useState('');
  const [showVerification, setShowVerification] = useState(false);

  // After registration, show verification screen:
  // {showVerification && (
  //   <div className="verification-container">
  //     <h3>Verify Your Email</h3>
  //     <p>We sent a code to {formData.email}</p>
  //     <input
  //       type="text"
  //       placeholder="000000"
  //       value={verificationCode}
  //       onChange={(e) => setVerificationCode(e.target.value)}
  //       className="form-input"
  //     />
  //     <button className="form-button">Verify Code</button>
  //   </div>
  // )}

  // Send verification code to: POST /api/auth/verify
}

// ============================================================
// EXAMPLE 4: Adding Password Strength Indicator
// ============================================================

export function PasswordStrengthIndicator() {
  // CSS for password strength meter:
  /*
  .password-strength {
    margin-top: 0.5rem;
    height: 4px;
    background: #e0e0e0;
    border-radius: 2px;
    overflow: hidden;
  }

  .password-strength-bar {
    height: 100%;
    transition: width 0.3s ease;
  }

  .strength-weak {
    width: 33%;
    background: #ff6b6b;
  }

  .strength-medium {
    width: 66%;
    background: #ffa94d;
  }

  .strength-strong {
    width: 100%;
    background: #4caf50;
  }
  */

  const calculateStrength = (password: string) => {
    let strength = 0;
    if (password.length >= 8) strength++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength++;
    if (/[0-9]/.test(password)) strength++;
    if (/[^a-zA-Z0-9]/.test(password)) strength++;
    return strength;
  };

  // Use in component:
  // const strength = calculateStrength(formData.password);
  // <div className="password-strength">
  //   <div className={`password-strength-bar strength-${
  //     strength === 0 ? 'weak' :
  //     strength <= 2 ? 'medium' : 'strong'
  //   }`}></div>
  // </div>
}

// ============================================================
// EXAMPLE 5: Adding Two-Factor Authentication (2FA)
// ============================================================

export function AuthFormWith2FA() {
  // After login success:
  // if (response.requires2FA) {
  //   setShow2FAPrompt(true);
  // }

  // Show 2FA input:
  // {show2FAPrompt && (
  //   <div className="form-group">
  //     <label className="form-label">
  //       Enter 6-digit code from authenticator app
  //     </label>
  //     <input
  //       type="text"
  //       maxLength="6"
  //       placeholder="000000"
  //       className="form-input"
  //     />
  //     <button type="button" className="form-button">
  //       Verify Code
  //     </button>
  //   </div>
  // )}

  // API: POST /api/auth/verify-2fa
}

// ============================================================
// EXAMPLE 6: Adding Password Visibility Toggle
// ============================================================

export function AuthFormWithPasswordToggle() {
  const [showPassword, setShowPassword] = useState(false);

  // CSS for toggle button:
  /*
  .password-toggle {
    position: absolute;
    right: 1rem;
    top: 50%;
    transform: translateY(-50%);
    background: none;
    border: none;
    cursor: pointer;
    color: #333333;
    font-size: 1.2rem;
  }
  */

  // Update input field:
  // <div style={{ position: 'relative' }}>
  //   <input
  //     type={showPassword ? 'text' : 'password'}
  //     // ... other props
  //   />
  //   <button
  //     type="button"
  //     className="password-toggle"
  //     onClick={() => setShowPassword(!showPassword)}
  //   >
  //     {showPassword ? '🙈' : '👁️'}
  //   </button>
  // </div>
}

// ============================================================
// EXAMPLE 7: Adding Terms & Conditions Checkbox
// ============================================================

export function AuthFormWithTerms() {
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  // Add validation:
  // if (!isLogin && !agreedToTerms) {
  //   newErrors.terms = 'You must agree to the terms';
  // }

  // Add to registration form:
  // {!isLogin && (
  //   <div className="form-group">
  //     <label className="form-label">
  //       <input
  //         type="checkbox"
  //         checked={agreedToTerms}
  //         onChange={(e) => setAgreedToTerms(e.target.checked)}
  //       />
  //       I agree to the{' '}
  //       <a href="/terms" target="_blank">Terms of Service</a>
  //       {' '}and{' '}
  //       <a href="/privacy" target="_blank">Privacy Policy</a>
  //     </label>
  //     {errors.terms && (
  //       <div className="error-message show">{errors.terms}</div>
  //     )}
  //   </div>
  // )}
}

// ============================================================
// EXAMPLE 8: Adding Phone Number Field
// ============================================================

export function AuthFormWithPhone() {
  // Add to FormData interface:
  // interface FormData {
  //   phoneNumber?: string;
  // }

  // Add field to registration:
  // {!isLogin && (
  //   <div className="form-group">
  //     <label htmlFor="phoneNumber" className="form-label">
  //       Phone Number
  //     </label>
  //     <input
  //       type="tel"
  //       id="phoneNumber"
  //       name="phoneNumber"
  //       value={formData.phoneNumber}
  //       onChange={handleChange}
  //       placeholder="+1 (555) 000-0000"
  //       className={`form-input ${errors.phoneNumber ? 'error' : ''}`}
  //     />
  //   </div>
  // )}

  // Add validation:
  // const phoneRegex = /^\+?[\d\s\-()]+$/;
  // if (!phoneRegex.test(formData.phoneNumber)) {
  //   newErrors.phoneNumber = 'Invalid phone number';
  // }
}

// ============================================================
// EXAMPLE 9: Adding OAuth/Social Login Integration
// ============================================================

export function OAuthLoginExample() {
  const handleGoogleLogin = async () => {
    // 1. Redirect to Google OAuth
    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?
      client_id=${process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID}&
      redirect_uri=${process.env.NEXT_PUBLIC_GOOGLE_REDIRECT_URI}&
      response_type=code&
      scope=openid email profile`;
  };

  // 2. Create callback page: app/auth/google/callback.tsx
  // 3. Exchange code for token on server
  // 4. Create user session

  // For GitHub:
  const handleGitHubLogin = async () => {
    window.location.href = `https://github.com/login/oauth/authorize?
      client_id=${process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID}&
      redirect_uri=${process.env.NEXT_PUBLIC_GITHUB_REDIRECT_URI}&
      scope=user:email`;
  };
}

// ============================================================
// EXAMPLE 10: Adding Rate Limiting Message
// ============================================================

export function AuthFormWithRateLimit() {
  const [attemptCount, setAttemptCount] = useState(0);
  const [blockedUntil, setBlockedUntil] = useState<Date | null>(null);

  const handleSubmitWithRateLimit = async (e: React.FormEvent) => {
    if (blockedUntil && new Date() < blockedUntil) {
      const waitSeconds = Math.ceil(
        (blockedUntil.getTime() - new Date().getTime()) / 1000
      );
      setErrors({
        email: `Too many attempts. Try again in ${waitSeconds} seconds.`,
      });
      return;
    }

    // Increment attempts
    if (attemptCount >= 5) {
      const now = new Date();
      setBlockedUntil(new Date(now.getTime() + 15 * 60 * 1000)); // 15 minutes
      setErrors({
        email: 'Too many login attempts. Please try again later.',
      });
      return;
    }
  };
}

// ============================================================
// EXAMPLE 11: Custom Error Handler
// ============================================================

export class AuthError extends Error {
  constructor(
    public code: string,
    public message: string,
    public statusCode: number = 400
  ) {
    super(message);
  }
}

// Use in API responses:
/*
const errors: Record<string, string> = {
  'email_taken': 'This email is already registered',
  'invalid_email': 'Please enter a valid email address',
  'weak_password': 'Password must contain letters, numbers, and symbols',
  'server_error': 'An error occurred. Please try again later',
};

if (error.code in errors) {
  setErrors({ email: errors[error.code] });
}
*/

// ============================================================
// EXAMPLE 12: Adding CSRF Protection
// ============================================================

export function AuthFormWithCSRF() {
  // 1. Get CSRF token on component mount:
  // useEffect(() => {
  //   fetch('/api/auth/csrf-token')
  //     .then(res => res.json())
  //     .then(data => setCsrfToken(data.token));
  // }, []);

  // 2. Add to form submission:
  // const payload = {
  //   ...formData,
  //   _csrf: csrfToken,
  // };

  // 3. Verify on server:
  // import { verifyCsrfToken } from '@/lib/csrf';
  // if (!verifyCsrfToken(request.headers.get('x-csrf-token'))) {
  //   throw new Error('Invalid CSRF token');
  // }
}

export default AuthFormWithRememberMe;
