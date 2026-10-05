# WorkZen HRMS - Frontend

Smart Human Resource Management System - Frontend Application

## Tech Stack

- **React 18** - UI library
- **Vite** - Build tool and dev server
- **React Router v6** - Client-side routing
- **Axios** - HTTP client
- **CSS3** - Styling (Odoo brand colors)

## Design Philosophy

- **Minimal UI** - Clean, focused interface
- **Odoo Brand Colors** - Purple (#714B67) and Gray (#878787)
- **Dark Theme** - Modern, professional appearance
- **Responsive** - Mobile-first design

## Installation

1. **Install Dependencies**
   ```bash
   cd frontend
   npm install
   ```

2. **Environment Setup**
   
   Create `.env` file (optional):
   ```env
   VITE_API_URL=http://localhost:5000/api
   ```

3. **Start Development Server**
   ```bash
   npm run dev
   ```
   
   Application runs on: `http://localhost:5173`

## Features

### Demo Login Accounts

The login screen includes seeded local demo accounts. From `backend`, run
`npm run seed:demo` before signing in:

| Role | Email | Password |
|---|---|---|
| Admin | `admin@workzen.demo` | `Admin@123` |
| HR Officer | `hr@workzen.demo` | `Hr@123` |
| Payroll Officer | `payroll@workzen.demo` | `Payroll@123` |
| Employee | `employee@workzen.demo` | `Employee@123` |

### Authentication
- ✅ Sign In page with email/password
- ✅ Sign Up page for admin registration
- ✅ JWT token-based authentication
- ✅ Protected routes with role-based access
- ✅ Password visibility toggle
- ✅ Form validation
- ✅ Error handling

### User Interface
- Dark theme with Odoo purple (#714B67) accent
- Minimal, clean design
- Responsive layout
- Smooth animations and transitions
- Loading states and spinners

### Dashboard
- User profile display
- Role-based information
- Employee details
- Quick stats overview

## Project Structure

```
frontend/
├── src/
│   ├── components/
│   │   └── ProtectedRoute.jsx    # Route protection component
│   ├── context/
│   │   └── AuthContext.jsx       # Authentication state management
│   ├── pages/
│   │   ├── SignIn.jsx            # Login page
│   │   ├── SignUp.jsx            # Registration page
│   │   └── Dashboard.jsx         # Main dashboard
│   ├── services/
│   │   ├── api.js                # Axios configuration
│   │   └── authService.js        # API service methods
│   ├── styles/
│   │   └── App.css               # Global styles
│   ├── App.jsx                   # Main app component with routing
│   └── main.jsx                  # React entry point
├── index.html                    # HTML template
├── vite.config.js                # Vite configuration
└── package.json                  # Dependencies
```

## Available Scripts

```bash
npm run dev      # Start development server
npm run build    # Build for production
npm run preview  # Preview production build
npm run lint     # Run ESLint
```

## Routing

| Route | Component | Access | Description |
|-------|-----------|--------|-------------|
| `/` | Redirect | Public | Redirects to `/login` |
| `/login` | SignIn | Public | User login page |
| `/signup` | SignUp | Public | User registration |
| `/dashboard` | Dashboard | Protected | Admin/HR/Payroll dashboard |
| `/employee/dashboard` | Dashboard | Protected | Employee dashboard |

## Authentication Flow

1. User enters credentials on Sign In page
2. Frontend sends POST request to `/api/auth/login`
3. Backend validates and returns JWT token
4. Token stored in `localStorage`
5. Token automatically added to all subsequent requests
6. User redirected to appropriate dashboard based on role

## State Management

- **AuthContext** - Global authentication state
- `user` - Current user information
- `isAuthenticated` - Authentication status
- `loading` - Loading state
- `login()` - Login function
- `register()` - Registration function
- `logout()` - Logout function

## API Integration

All API calls go through the `api.js` service which:
- Sets base URL to backend
- Adds JWT token to headers automatically
- Handles 401 unauthorized errors
- Redirects to login on authentication failure

## Styling Guidelines

### Color Palette

```css
--odoo-purple: #714B67
--odoo-purple-light: #8B5F83
--odoo-purple-dark: #5A3C52
--odoo-gray: #878787
--odoo-gray-light: #A8A8A8
--odoo-gray-dark: #666666
```

### UI Components

- **Buttons** - Purple gradient with hover effects
- **Inputs** - Dark background with purple focus border
- **Cards** - Dark card with subtle borders
- **Alerts** - Color-coded for success/error/info

## Form Validation

### Sign In
- Email format validation
- Required fields check
- Real-time error display

### Sign Up
- Email format validation
- Password length (min 6 characters)
- Password confirmation match
- Required fields check

## Security Features

- JWT token stored in localStorage
- Automatic token expiration handling
- Protected routes with role checking
- CSRF protection via tokens
- XSS prevention via React

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## Development Tips

1. **Hot Module Replacement** - Changes reflect instantly
2. **Proxy Setup** - API requests proxied to backend
3. **Error Boundaries** - Add for production
4. **Code Splitting** - Use React.lazy for large components

## Future Enhancements

- [x] Employee attendance check-in/check-out interface
- [x] Paginated employee and HR/Admin attendance history
- [x] Attendance search, filters, and CSV export
- [ ] Leave application forms
- [ ] Payroll viewing
- [ ] Profile editing
- [ ] Admin dashboard with charts
- [ ] Employee list and management
- [ ] Real-time notifications
- [ ] Dark/Light theme toggle

## Troubleshooting

### CORS Issues
- Ensure backend CORS is configured
- Check proxy settings in `vite.config.js`

### API Connection Failed
- Verify backend is running on port 5000
- Check `VITE_API_URL` in `.env`

### Build Errors
- Clear node_modules and reinstall
- Check Node.js version (v18+ recommended)

## Build for Production

```bash
npm run build
```

Output will be in `dist/` folder. Deploy to:
- Netlify
- Vercel
- AWS S3 + CloudFront
- Any static hosting service

## Performance

- Vite's lightning-fast HMR
- Code splitting with React Router
- Lazy loading for routes
- Optimized production builds
- Tree shaking for minimal bundle size
