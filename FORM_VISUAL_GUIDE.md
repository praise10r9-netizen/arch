# Login & Register Form - Visual Guide

## 🎨 Color Palette

```
Primary Panel (Form Background):     #B30000
Panel Gradient/Highlights:           #A80F16
Buttons:                             #A80000
Input Fields:                        #FFFFFF
Input Text:                          #333333
Labels/Secondary Text:               #EEEEEE
Page Background:                     #EBEBEB
Shadows:                             rgba(0,0,0,0.4)
Close Icons:                         #FFFFFF
```

## 📱 Login Form Preview

```
┌─────────────────────────────────────────┐
│                                         │
│           Welcome Back                  │
│      Sign in to your account            │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ Email Address                   │   │
│  │ ┌───────────────────────────┐   │   │
│  │ │ you@example.com           │   │   │
│  │ └───────────────────────────┘   │   │
│  └─────────────────────────────────┘   │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ Password                        │   │
│  │ ┌───────────────────────────┐   │   │
│  │ │ ••••••••                  │   │   │
│  │ └───────────────────────────┘   │   │
│  └─────────────────────────────────┘   │
│                     Forgot password? → │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │         SIGN IN                 │   │
│  └─────────────────────────────────┘   │
│                                         │
│     Don't have an account? Register →  │
│                                         │
└─────────────────────────────────────────┘
```

## 📝 Registration Form Preview

```
┌─────────────────────────────────────────┐
│                                         │
│          Create Account                 │
│            Join us today                │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ Full Name                       │   │
│  │ ┌───────────────────────────┐   │   │
│  │ │ John Doe                  │   │   │
│  │ └───────────────────────────┘   │   │
│  └─────────────────────────────────┘   │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ Email Address                   │   │
│  │ ┌───────────────────────────┐   │   │
│  │ │ you@example.com           │   │   │
│  │ └───────────────────────────┘   │   │
│  └─────────────────────────────────┘   │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ Password                        │   │
│  │ ┌───────────────────────────┐   │   │
│  │ │ ••••••••                  │   │   │
│  │ └───────────────────────────┘   │   │
│  └─────────────────────────────────┘   │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ Confirm Password                │   │
│  │ ┌───────────────────────────┐   │   │
│  │ │ ••••••••                  │   │   │
│  │ └───────────────────────────┘   │   │
│  └─────────────────────────────────┘   │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │      CREATE ACCOUNT             │   │
│  └─────────────────────────────────┘   │
│                                         │
│     Already have an account? Sign In →  │
│                                         │
└─────────────────────────────────────────┘
```

## ✨ Interactive Features

### Hover Effects
- Buttons change to deeper red on hover
- Links become slightly transparent
- Smooth transitions (0.3s ease)

### Focus States
- Input fields display focus ring with gradient color
- Clear visual feedback for keyboard navigation

### Validation States
- Red error messages appear below invalid fields
- Input border turns red on error
- Clear field-specific error text

### Loading State
- Button shows "Loading..." text
- Button and inputs disabled during submission
- Prevents duplicate submissions

### Success State
- Green success message appears
- Form automatically clears after 2 seconds
- User can proceed with next action

## 🔄 Form Toggle

Users can seamlessly switch between login and registration:
1. Click "Register" link on login form → switches to registration
2. Click "Sign In" link on registration form → switches to login
3. Form data clears on toggle
4. All errors reset on toggle

## 🌐 Responsive Breakpoints

### Mobile (max-width: 480px)
- Reduced padding (1.5rem instead of 2rem)
- Smaller heading size
- Adjusted input padding
- Full-width inputs

### Tablet & Desktop
- Max form width: 420px
- Centered on page
- Standard spacing

## 🎯 Form States

### 1. Initial State
- All fields empty
- No error messages
- Submit button enabled
- Ready for input

### 2. Validating State
- User enters data
- Form validates in real-time
- Errors clear when corrected
- Submit button ready

### 3. Loading State
- User clicks submit
- Button shows "Loading..."
- Inputs and button disabled
- Network request in progress

### 4. Success State
- Green checkmark message
- Form clears automatically
- Returns to initial state

### 5. Error State
- Red error messages below fields
- Red input borders
- Error at top of form (for API errors)
- User can correct and resubmit

## 🎨 CSS Classes Reference

| Class | Purpose |
|-------|---------|
| `.auth-wrapper` | Main container, full height, centered |
| `.form-container` | Form box with red background |
| `.form-header` | Title and subtitle area |
| `.form-group` | Individual field wrapper |
| `.form-label` | Field labels in light gray |
| `.form-input` | Input fields |
| `.form-input.error` | Input with error state |
| `.form-button` | Submit button |
| `.form-footer` | Login/Register toggle area |
| `.success-message` | Success notification |
| `.error-message` | Error message text |
| `.forgot-password` | "Forgot password?" link |

## 🔌 API Integration

### POST /api/auth/login

**Request:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Login successful",
  "user": {
    "id": "123",
    "email": "user@example.com",
    "name": "User Name"
  }
}
```

### POST /api/auth/register

**Request:**
```json
{
  "name": "John Doe",
  "email": "user@example.com",
  "password": "password123"
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Registration successful",
  "user": {
    "id": "123",
    "name": "John Doe",
    "email": "user@example.com"
  }
}
```

## 📊 Component State Flow

```
Initial
   ↓
User Types → Validate in Real-time
   ↓
User Submits → validateForm()
   ↓
   If Invalid → Show Errors
   ↓
   If Valid → setIsLoading(true)
   ↓
   Send API Request
   ↓
   Response Success → Show Success Message → Clear Form
   Response Error → Show Error Message → Await Correction
```

## 🚀 Getting Started

1. **View the form:**
   ```bash
   cd /home/atom/Projects/nxtgen/archproject/arch
   npm run dev
   ```

2. **Open browser:**
   Navigate to `http://localhost:3000`

3. **Test login:**
   - Email: `demo@example.com`
   - Password: `password123`

4. **Try registration:**
   - Switch to register mode
   - Fill in name, email, and password
   - Submit

5. **Customize:**
   - Edit colors in `app/globals.css`
   - Modify API endpoints in `app/api/auth/`
   - Add fields to component in `app/components/AuthForm.tsx`

## 📚 File References

- **Component:** [app/components/AuthForm.tsx](/app/components/AuthForm.tsx)
- **Styles:** [app/styles/auth.css](/app/styles/auth.css) + [app/globals.css](/app/globals.css)
- **API Login:** [app/api/auth/login/route.ts](/app/api/auth/login/route.ts)
- **API Register:** [app/api/auth/register/route.ts](/app/api/auth/register/route.ts)
- **Home Page:** [app/page.tsx](/app/page.tsx)
- **Full Guide:** [AUTH_FORM_GUIDE.md](/AUTH_FORM_GUIDE.md)

---

Ready to use! 🎉
