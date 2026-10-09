# Login & Register Form - Setup & Customization Guide

## 📋 Overview

This is a modern, professional login and registration form component built with React and Next.js 16, featuring:

- ✨ Beautiful UI with custom color scheme
- 🔄 Toggle between login and register modes
- ✅ Real-time form validation
- 🎨 Responsive design (mobile-friendly)
- 🔐 Password confirmation for registration
- 📱 Accessibility features
- ⚡ Smooth animations and transitions

## 🎨 Color Scheme

Your custom brand colors are defined in [app/globals.css](/app/globals.css):

| Element | Color | Usage |
|---------|-------|-------|
| Primary Panel | #B30000 | Form background |
| Panel Gradient | #A80F16 | Highlights and hover states |
| Button | #A80000 | Submit button background |
| Input Fields | #FFFFFF | Input field background |
| Input Text | #333333 | Text inside input fields |
| Labels | #EEEEEE | Form labels and secondary text |
| Page Background | #EBEBEB | Page background |
| Shadows | rgba(0,0,0,0.4) | Drop shadows |
| Close Icons | #FFFFFF | Icon colors |

## 📁 File Structure

```
app/
├── components/
│   └── AuthForm.tsx          # Main form component
├── styles/
│   └── auth.css              # Additional styling and animations
├── api/auth/
│   ├── login/
│   │   └── route.ts          # Login API endpoint
│   └── register/
│       └── route.ts          # Registration API endpoint
├── globals.css               # Global styles and CSS variables
├── layout.tsx                # Root layout
└── page.tsx                  # Home page (displays AuthForm)
```

## 🚀 Quick Start

1. The AuthForm component is already integrated in [app/page.tsx](/app/page.tsx)
2. Run your dev server:
   ```bash
   npm run dev
   # or
   bun run dev
   ```
3. Visit `http://localhost:3000` to see the form

## 🔧 Customization

### Changing Colors

Edit the CSS variables in [app/globals.css](/app/globals.css):

```css
:root {
  --primary-deep-red: #B30000;
  --primary-gradient: #A80F16;
  --button-red: #A80000;
  --input-bg: #FFFFFF;
  --input-text: #333333;
  --label-text: #EEEEEE;
  --page-bg: #EBEBEB;
  --shadow-color: rgba(0, 0, 0, 0.4);
  --close-icon: #FFFFFF;
}
```

### Adjusting Form Size

Modify the `form-container` class in [app/globals.css](/app/globals.css):

```css
.form-container {
  max-width: 420px; /* Change this value */
  padding: 2rem;    /* Change this value */
  border-radius: 12px;
}
```

### Adding Custom Fields

Edit [app/components/AuthForm.tsx](/app/components/AuthForm.tsx) to add fields:

```tsx
// Add to FormData interface
interface FormData {
  email: string;
  password: string;
  phoneNumber?: string; // New field
  // ...
}

// Add validation
if (!formData.phoneNumber) {
  newErrors.phoneNumber = 'Phone number is required';
}

// Add input in JSX
<div className="form-group">
  <label htmlFor="phoneNumber" className="form-label">
    Phone Number
  </label>
  <input
    type="tel"
    id="phoneNumber"
    name="phoneNumber"
    value={formData.phoneNumber}
    onChange={handleChange}
    placeholder="(123) 456-7890"
    className={`form-input ${errors.phoneNumber ? 'error' : ''}`}
  />
</div>
```

## 🔐 Backend Integration

The form sends POST requests to:

- **Login**: `/api/auth/login`
  - Payload: `{ email: string, password: string }`
- **Register**: `/api/auth/register`
  - Payload: `{ name: string, email: string, password: string }`

### Expected Response Format

**Success (200/201):**
```json
{
  "success": true,
  "message": "Login successful",
  "user": {
    "id": "user-id",
    "email": "user@example.com",
    "name": "User Name"
  }
}
```

**Error (400/401/500):**
```json
{
  "message": "Error description"
}
```

### Example Implementation with Database

Replace the placeholder logic in the API routes with your actual authentication:

```tsx
// app/api/auth/login/route.ts
import { getUser, verifyPassword } from '@/lib/auth';

export async function POST(request: NextRequest) {
  const { email, password } = await request.json();

  const user = await getUser(email);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return NextResponse.json(
      { message: 'Invalid credentials' },
      { status: 401 }
    );
  }

  // Set session/JWT token
  const response = NextResponse.json({
    success: true,
    message: 'Login successful',
    user,
  });

  // Set auth cookie or token
  response.cookies.set('auth-token', generateToken(user));

  return response;
}
```

## 📱 Form Features

### Validation

The form validates:
- ✉️ Email format
- 🔐 Password length (minimum 6 characters)
- 🔄 Password confirmation match (registration only)
- 👤 Name presence (registration only)

### User Experience

- Clear error messages for each field
- Real-time error clearing when user starts typing
- Loading state during submission
- Success message display
- Smooth transitions and animations
- Disabled state during form submission

## 🎯 Usage Examples

### Basic Import

```tsx
import AuthForm from '@/app/components/AuthForm';

export default function LoginPage() {
  return <AuthForm />;
}
```

### Customized Wrapper

```tsx
import AuthForm from '@/app/components/AuthForm';

export default function AuthPage() {
  return (
    <div className="custom-wrapper">
      <AuthForm />
    </div>
  );
}
```

## 🔒 Security Considerations

⚠️ **Important Security Notes:**

1. **Password Hashing**: Always hash passwords using bcrypt, argon2, or similar
2. **HTTPS Only**: Use HTTPS in production
3. **CSRF Protection**: Implement CSRF tokens for form submissions
4. **Rate Limiting**: Add rate limiting to prevent brute force attacks
5. **Input Sanitization**: Sanitize all inputs on both client and server
6. **Never Log Passwords**: Never log sensitive data
7. **Secure Cookies**: Use secure, httpOnly cookies for session tokens

Example secure password hashing:

```tsx
import bcrypt from 'bcrypt';

const passwordHash = await bcrypt.hash(password, 10);
const isValid = await bcrypt.compare(inputPassword, passwordHash);
```

## 🌐 Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)
- Mobile browsers

## ♿ Accessibility

The form includes:
- Proper label associations
- ARIA attributes
- Keyboard navigation support
- Focus visible states
- Clear error announcements

## 📦 Dependencies

- React 19.3.0
- Next.js 16.4.0
- Tailwind CSS 4
- TypeScript 5

## 🛠️ Advanced Customization

### Changing Form Width

```css
.form-container {
  max-width: 500px; /* Increase width */
}
```

### Custom Validation Logic

```tsx
const validateForm = (): boolean => {
  const newErrors: FormErrors = {};

  // Add your custom validation here
  if (formData.email.includes('test')) {
    newErrors.email = 'Test emails are not allowed';
  }

  setErrors(newErrors);
  return Object.keys(newErrors).length === 0;
};
```

### Adding Social Login

```tsx
<button type="button" className="social-login-button">
  Continue with Google
</button>
```

### Adding reCAPTCHA

```tsx
import ReCAPTCHA from 'react-google-recaptcha';

// Add to form
<ReCAPTCHA
  sitekey={process.env.NEXT_PUBLIC_RECAPTCHA_KEY}
  onChange={(token) => setRecaptchaToken(token)}
/>
```

## 📚 Additional Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [React Documentation](https://react.dev)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [Web Accessibility Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)

## 🐛 Troubleshooting

### Form not showing?
- Check that `AuthForm` is imported correctly in `page.tsx`
- Ensure styles are loaded from `globals.css`

### Colors not applying?
- Clear browser cache
- Check CSS variables in `globals.css`
- Verify CSS is imported in component

### API calls failing?
- Check Network tab in browser DevTools
- Verify API routes exist in `app/api/auth/`
- Check request/response format

### Styling issues?
- Ensure Tailwind CSS is properly configured
- Check if CSS variables are defined
- Verify `auth.css` is imported in component

## 📝 License

This component is provided as-is for your project.

---

**Happy coding!** 🚀
