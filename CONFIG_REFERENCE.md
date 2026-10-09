# 🎨 Configuration Reference

## Color Scheme Configuration

All colors are defined as CSS variables in `app/globals.css`. You can easily customize them by modifying the `:root` section.

### Current Color Configuration

```css
:root {
  /* Brand Colors */
  --primary-deep-red: #B30000;      /* Form background */
  --primary-gradient: #A80F16;      /* Hover states, focus */
  --button-red: #A80000;            /* Button background */
  --input-bg: #FFFFFF;              /* Input field background */
  --input-text: #333333;            /* Text in inputs */
  --label-text: #EEEEEE;            /* Labels and secondary text */
  --page-bg: #EBEBEB;               /* Page background */
  --shadow-color: rgba(0, 0, 0, 0.4); /* Shadows */
  --close-icon: #FFFFFF;            /* Icon colors */
}
```

### How to Change Colors

**Example: Changing the primary red to a different shade**

```css
:root {
  --primary-deep-red: #C70000; /* Changed from #B30000 */
}
```

**Example: Changing from red to blue theme**

```css
:root {
  --primary-deep-red: #003366;
  --primary-gradient: #004499;
  --button-red: #0055CC;
}
```

---

## Form Configuration

### Form Container Size

Located in `app/globals.css` under `.form-container`:

```css
.form-container {
  max-width: 420px;    /* Change this to make form wider/narrower */
  padding: 2rem;       /* Change this to adjust padding */
  border-radius: 12px; /* Change this to adjust corner roundness */
}
```

**Size Examples:**
- Compact: `max-width: 320px`
- Standard: `max-width: 420px` (current)
- Wide: `max-width: 520px`

### Spacing Configuration

```css
.form-group {
  margin-bottom: 1.5rem; /* Space between fields */
}

.form-header {
  margin-bottom: 2rem;   /* Space below title */
}

.form-footer {
  margin-top: 1.5rem;    /* Space above footer */
}
```

---

## Typography Configuration

### Heading Size

In `app/globals.css`:

```css
.form-header h2 {
  font-size: 1.75rem;    /* Main heading size */
  font-weight: 600;      /* Font weight */
}

.form-header p {
  font-size: 0.875rem;   /* Subtitle size */
}
```

### Input Text Size

```css
.form-input {
  font-size: 1rem;       /* Input text size */
}

.form-label {
  font-size: 0.875rem;   /* Label text size */
}
```

### Font Family

Edit `app/layout.tsx`:

```tsx
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});
```

To use a different font:

```tsx
import { Roboto, OpenSans, Poppins } from "next/font/google";

const customFont = Poppins({
  variable: "--custom-font",
  weight: ["400", "600"],
  subsets: ["latin"],
});
```

---

## Button Configuration

### Button Styling

Located in `app/globals.css`:

```css
.form-button {
  padding: 0.875rem;     /* Button padding */
  font-size: 1rem;       /* Button text size */
  font-weight: 600;      /* Button text weight */
  text-transform: uppercase; /* Text style */
  letter-spacing: 0.5px; /* Letter spacing */
  border-radius: 6px;    /* Corner roundness */
}

.form-button:hover {
  box-shadow: 0 4px 12px var(--shadow-color); /* Hover shadow */
  transform: translateY(-2px);                  /* Lift effect */
}
```

### Button Size Variations

```css
/* Small button */
.form-button.small {
  padding: 0.625rem;
  font-size: 0.875rem;
}

/* Large button */
.form-button.large {
  padding: 1rem;
  font-size: 1.125rem;
}
```

---

## Input Field Configuration

### Input Styling

```css
.form-input {
  padding: 0.75rem 1rem;   /* Inner spacing */
  border-radius: 6px;      /* Corner roundness */
  border: 2px solid transparent; /* Border */
  font-size: 1rem;         /* Text size */
}

.form-input:focus {
  border-color: var(--primary-gradient);
  box-shadow: 0 0 0 3px rgba(168, 15, 22, 0.1); /* Focus glow */
}
```

### Input Error State

```css
.form-input.error {
  border-color: #ff6b6b;  /* Error red */
}
```

---

## Animation Configuration

### Transition Speed

Update in `app/globals.css`:

```css
.form-button {
  transition: all 0.3s ease; /* Change 0.3s to speed up/slow down */
}

.form-input {
  transition: all 0.3s ease;
}
```

### Success Message Animation

In `app/styles/auth.css`:

```css
@keyframes slideIn {
  from {
    transform: translateY(-10px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}
```

### Custom Animation

```css
@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.success-message {
  animation: fadeIn 0.5s ease-out;
}
```

---

## Responsive Design Configuration

### Mobile Breakpoint

In `app/globals.css`:

```css
@media (max-width: 480px) {
  .form-container {
    padding: 1.5rem;      /* Reduce padding on mobile */
  }

  .form-header h2 {
    font-size: 1.5rem;    /* Smaller heading */
  }
}
```

### Tablet Breakpoint

Add to `app/styles/auth.css`:

```css
@media (max-width: 768px) {
  .form-container {
    max-width: 100%;      /* Full width */
    margin: 1rem;
  }
}
```

---

## Validation Configuration

### Min Password Length

In `app/components/AuthForm.tsx`:

```tsx
const MIN_PASSWORD_LENGTH = 6;

if (formData.password.length < MIN_PASSWORD_LENGTH) {
  newErrors.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
}
```

### Email Validation Pattern

```tsx
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

if (!EMAIL_REGEX.test(formData.email)) {
  newErrors.email = 'Please enter a valid email';
}
```

### Custom Validation

```tsx
// Add phone number validation
const PHONE_REGEX = /^\+?[\d\s\-()]{10,}$/;

if (formData.phoneNumber && !PHONE_REGEX.test(formData.phoneNumber)) {
  newErrors.phoneNumber = 'Invalid phone number';
}
```

---

## API Configuration

### API Endpoints

Defined in `app/components/AuthForm.tsx`:

```tsx
const endpoint = isLogin 
  ? '/api/auth/login'      // Login endpoint
  : '/api/auth/register';  // Register endpoint
```

### API Timeout

Add to component:

```tsx
const TIMEOUT = 30000; // 30 seconds

const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), TIMEOUT);

const response = await fetch(endpoint, {
  method: 'POST',
  signal: controller.signal,
  // ...
});

clearTimeout(timeout);
```

### API Response Format

Expected success response:

```json
{
  "success": true,
  "message": "Operation successful",
  "user": {
    "id": "123",
    "email": "user@example.com",
    "name": "User Name"
  }
}
```

Expected error response:

```json
{
  "message": "Error description"
}
```

---

## Shadow Configuration

### Shadow Intensity

Change the shadow color opacity:

```css
:root {
  --shadow-color: rgba(0, 0, 0, 0.2); /* Lighter shadow */
  --shadow-color: rgba(0, 0, 0, 0.4); /* Current (medium) */
  --shadow-color: rgba(0, 0, 0, 0.6); /* Darker shadow */
}
```

### Custom Shadows

In `app/globals.css`:

```css
.form-container {
  box-shadow: 0 8px 24px var(--shadow-color);
}

/* Add more specific shadow */
.form-input:focus {
  box-shadow: 0 0 0 3px rgba(168, 15, 22, 0.1);
}
```

---

## Accessibility Configuration

### Focus Outline

```css
.form-input:focus-visible {
  outline: 2px solid var(--primary-gradient);
  outline-offset: 2px;
}

.form-button:focus-visible {
  outline: 2px solid var(--close-icon);
  outline-offset: 2px;
}
```

### Label Color Contrast

Ensure good contrast between label and background:

```css
.form-label {
  color: var(--label-text); /* Light color on dark background */
}
```

---

## Environment Variables

Create `.env.local` in project root:

```env
# API Configuration
NEXT_PUBLIC_API_URL=http://localhost:3000/api

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/dbname

# Authentication
JWT_SECRET=your-secret-key-here

# Email Service (for verification)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-password

# Social Login (optional)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-secret
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-secret

# Security
RECAPTCHA_SECRET_KEY=your-recaptcha-secret
```

Access in code:

```tsx
const apiUrl = process.env.NEXT_PUBLIC_API_URL;
const jwtSecret = process.env.JWT_SECRET;
```

---

## Performance Optimization

### Code Splitting

The component is already a client component (`'use client'`), which enables:
- Automatic code splitting
- Lazy loading
- Optimized bundle size

### Image Optimization

If adding logo:

```tsx
import Image from 'next/image';

<Image
  src="/logo.svg"
  alt="Logo"
  width={100}
  height={40}
  priority
/>
```

### CSS Optimization

Tailwind CSS is already configured with:
- Automatic purging of unused styles
- Built-in minification
- CSS-in-JS optimization

---

## Theme Configuration

### Dark Mode (Optional)

To add dark mode support:

```css
@media (prefers-color-scheme: dark) {
  :root {
    --primary-deep-red: #FF6B6B;
    --label-text: #1A1A1A;
    /* ... other dark colors ... */
  }
}
```

### Custom Theme

```tsx
// Create themes object
const themes = {
  red: {
    primary: '#B30000',
    button: '#A80000',
  },
  blue: {
    primary: '#0066CC',
    button: '#0055AA',
  },
};
```

---

## Quick Configuration Snippets

### Change Form Width
```css
.form-container {
  max-width: 500px; /* Default is 420px */
}
```

### Change Button Color
```css
:root {
  --button-red: #FF0000;
}
```

### Change Input Border Radius
```css
.form-input {
  border-radius: 12px; /* More rounded */
}
```

### Change Animation Speed
```css
.form-button {
  transition: all 0.5s ease; /* Slower: 0.5s instead of 0.3s */
}
```

### Disable Hover Effects
```css
.form-button:hover {
  transform: none;
  background: var(--button-red);
}
```

---

For more information, see:
- 📖 [AUTH_FORM_GUIDE.md](AUTH_FORM_GUIDE.md)
- 📖 [FORM_VISUAL_GUIDE.md](FORM_VISUAL_GUIDE.md)
- 📖 [QUICK_START.md](QUICK_START.md)
