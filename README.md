# Team - 68

# Team Members

LaxmiNiroop Papani
Sharath Chandra Chandupatla
Zainab Amreen
Ishrath Jasmine

# Demo

https://drive.google.com/file/d/15srGdsJnu_gW45lxgUzSWsAI2y1dglLJ/view?usp=sharing

# Selected Problem Statement

WorkZen – Simplifying HR Operations for Smarter Workplaces

# WorkZen - Smart Human Resource Management System

![Odoo Logo](https://i.imgur.com/odoo-logo.png)

**WorkZen** is a comprehensive, all-in-one Human Resource Management System (HRMS) designed to modernize and simplify how organizations manage people, processes, and payroll. Built for the Odoo x Amalthea 2025 Hackathon.

## 🎯 Vision & Mission

WorkZen aims to provide a clean, reliable, and user-friendly experience for both employees and administrators—enabling seamless collaboration in managing attendance, leave, payroll, and analytics from a unified interface.

## 🏆 Hackathon Challenge

**Theme:** Smart Human Resource Management System

**Focus Areas:**

- ✅ User & Role Management
- ✅ Attendance & Leave Management
- ✅ Payroll Management
- ✅ Dashboard & Analytics

## 🛠️ Tech Stack

### Backend

- **Node.js** + **Express.js** - RESTful API server
- **MySQL** - Relational database with comprehensive schema
- **JWT** - Token-based authentication
- **bcryptjs** - Password hashing

### Frontend

- **Vite** + **React** - Modern, fast UI framework
- **React Router v6** - Client-side routing
- **Axios** - HTTP client
- **CSS3** - Custom styling with Odoo brand colors

### Database Architecture

- 12 interconnected tables
- Foreign key relationships for data integrity
- Indexes for optimized queries
- Views for complex queries
- Triggers for automatic calculations
- Stored procedures for business logic

## 🎨 Design

- **Minimal UI** - Clean, focused interface
- **Odoo Brand Colors** - Purple (#714B67) and Gray (#878787)
- **Dark Theme** - Modern, professional appearance
- **Responsive** - Works on all devices

## 📋 Features

### ✅ Implemented (Phase 1)

#### Authentication & Authorization

- User registration with role assignment
- Secure login with JWT tokens
- Role-based access control (Admin, HR Officer, Payroll Officer, Employee)
- Password encryption
- Protected routes

#### User Management

- User profiles with detailed information
- Employee code generation
- Department and designation management
- User status control (active/inactive)

#### Database Design

- Comprehensive schema with 12 tables
- Users, Roles, Employee Profiles
- Attendance tracking
- Leave management (types, balance, applications)
- Payroll (structure, components, processing)
- Audit logs for accountability

### ✅ Attendance Milestone 1 Complete

#### Attendance Management

- Timezone-aware check-in/check-out using configurable attendance rules
- Server-side worked-minute, late-minute, early-checkout, and status calculations
- One attendance record per employee per business date
- Employee attendance history with server-side pagination
- Admin/HR search, status, department, date-range filters, and pagination
- Backend-streamed CSV export
- Transaction-safe checkout and audited manual attendance corrections
- Automated service/database tests and live API verification

### 🚧 Remaining Modules

#### Leave Management

- Apply for leave with reason
- Multiple leave types (Casual, Sick, Earned, etc.)
- Leave balance tracking
- Approval/rejection workflow
- Leave history and reports

#### Payroll Management

- Salary structure definition
- Multiple salary components (earnings/deductions)
- Monthly payroll generation
- Payslip viewing and download
- Payment status tracking
- Salary breakdowns

#### Dashboard & Analytics

- Admin dashboard with key metrics
- Employee dashboard with personal stats
- Attendance charts and summaries
- Leave balance overview
- Department-wise statistics
- Recent activities

## 📁 Project Structure

```
Odoo-x-Amalthea-2025-Hackathon/
├── backend/
│   ├── src/
│   │   ├── config/          # Database configuration
│   │   ├── controllers/     # Request handlers
│   │   ├── database/        # Schema and initialization
│   │   ├── middleware/      # Auth and error handling
│   │   ├── models/          # Data access layer
│   │   └── routes/          # API endpoints
│   ├── .env                 # Environment variables
│   ├── server.js            # Express server
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── components/      # Reusable components
│   │   ├── context/         # State management
│   │   ├── pages/           # Page components
│   │   ├── services/        # API services
│   │   └── styles/          # CSS files
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
│
└── README.md
```

## 🚀 Getting Started

### Prerequisites

- Node.js v18+
- MySQL 8.0+
- npm or yarn

### Installation

#### 1. Clone the Repository

```bash
git clone https://github.com/Niroop8305/Odoo-x-Amalthea-2025-Hackathon.git
cd Odoo-x-Amalthea-2025-Hackathon
```

#### 2. Backend Setup

```bash
cd backend
npm install

# Configure .env file
cp .env.example .env
# Edit .env with your MySQL credentials

# Initialize database
npm run init-db

# Start backend server
npm run dev
```

Backend runs on: `http://localhost:5000`

#### 3. Frontend Setup

```bash
cd frontend
npm install

# Start frontend dev server
npm run dev
```

Frontend runs on: `http://localhost:5173`

### First Time Setup

1. Seed the local demo users:

   ```bash
   cd backend
   npm run seed:demo
   ```

2. Navigate to `http://localhost:5173/login` and use a demo account below.

### Demo Accounts

| Role | Email | Password |
|---|---|---|
| Admin | `admin@workzen.demo` | `Admin@123` |
| HR Officer | `hr@workzen.demo` | `Hr@123` |
| Payroll Officer | `payroll@workzen.demo` | `Payroll@123` |
| Employee | `employee@workzen.demo` | `Employee@123` |

## 📊 Database Schema

### Core Tables

1. **roles** - User roles (Admin, HR Officer, Payroll Officer, Employee)
2. **users** - User accounts and authentication
3. **employee_profiles** - Detailed employee information
4. **attendance** - Daily attendance records
5. **leave_types** - Different leave categories
6. **leave_balance** - Employee leave allocations
7. **leave_applications** - Leave requests
8. **salary_components** - Salary structure elements
9. **employee_salary_structure** - Individual salary details
10. **payroll** - Monthly payroll records
11. **payroll_details** - Salary breakdowns
12. **audit_logs** - System activity tracking

### Key Relationships

```
users ←→ roles (Many-to-One)
users ←→ employee_profiles (One-to-One)
users ←→ attendance (One-to-Many)
users ←→ leave_applications (One-to-Many)
users ←→ payroll (One-to-Many)
leave_applications ←→ leave_types (Many-to-One)
payroll ←→ payroll_details (One-to-Many)
```

## 🔐 API Endpoints

### Authentication

- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user
- `POST /api/auth/logout` - Logout

### Users

- `GET /api/users` - Get all users (Admin/HR)
- `GET /api/users/profile/:userId` - Get user profile
- `PUT /api/users/profile/:userId` - Update profile
- `PUT /api/users/:userId/status` - Update user status

### Attendance

- `POST /api/attendance/check-in` - Employee check-in
- `POST /api/attendance/check-out` - Employee check-out
- `GET /api/attendance/status` - Current employee status
- `GET /api/attendance/today` - Today's employee records
- `GET /api/attendance/my-logs` - Paginated employee history
- `GET /api/attendance/summary` - Monthly employee summary
- `GET /api/attendance/day` - Paginated HR/Admin daily records
- `GET /api/attendance/all` - Paginated HR/Admin records with filters
- `GET /api/attendance/export` - Filtered CSV export
- `PUT /api/attendance/:attendanceId` - Audited HR/Admin correction
- `DELETE /api/attendance/:attendanceId` - Admin deletion

### Leave

- `POST /api/leave/apply` - Apply for leave
- `GET /api/leave/my-leaves` - Get my leaves
- `GET /api/leave/all` - Get all (Admin/HR)
- `PUT /api/leave/:id/status` - Approve/Reject
- `GET /api/leave/balance` - Get balance
- `GET /api/leave/types` - Get leave types

### Payroll

- `GET /api/payroll/my-payroll` - Get my payroll
- `GET /api/payroll/payslip/:id` - Get payslip
- `GET /api/payroll/all` - Get all (Admin/Payroll)
- `POST /api/payroll/generate` - Generate payroll
- `PUT /api/payroll/:id/status` - Update status

### Dashboard

- `GET /api/dashboard/stats` - Admin statistics
- `GET /api/dashboard/my-stats` - Employee stats

## 👥 User Roles

| Role                | Permissions                                        |
| ------------------- | -------------------------------------------------- |
| **Admin**           | Full system access, user management, all reports   |
| **HR Officer**      | Employee management, attendance, leave approval    |
| **Payroll Officer** | Payroll generation, salary management              |
| **Employee**        | View own records, apply for leave, mark attendance |

## 🎨 UI Design

### Sign In Page

- Email/password login
- Password visibility toggle
- Clean, minimal design
- Error handling
- Link to sign up

### Sign Up Page

- Company name (optional)
- Name, email, phone
- Password with confirmation
- Form validation
- Link to sign in

### Dashboard

- Welcome message
- Role-based information
- User statistics
- Profile details
- Quick actions

## 🔒 Security Features

- **Password Hashing** - bcrypt with salt
- **JWT Tokens** - Secure authentication
- **Role-Based Access** - Authorization middleware
- **SQL Injection Prevention** - Parameterized queries
- **CORS Protection** - Configured origins
- **Environment Variables** - Sensitive data protection

## 📈 Scalability

- **Connection Pooling** - Efficient database connections
- **Indexed Queries** - Fast data retrieval
- **Foreign Keys** - Data integrity
- **Triggers** - Automatic calculations
- **Views** - Optimized complex queries

## 🧪 Testing

### Health Check

```bash
curl http://localhost:5000/api/health
```

### Test Login

```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@workzen.demo","password":"Admin@123"}'
```

## 🤝 Contributing

This is a hackathon project. Contributions and suggestions are welcome!

## 📝 License

MIT License - feel free to use this project for learning and development.

## 👨‍💻 Developer

**Niroop** - Odoo x Amalthea 2025 Hackathon

## 🙏 Acknowledgments

- Odoo for the amazing ERP platform and inspiration
- Amalthea 2025 Hackathon organizers
- Open source community

## 📞 Support

For issues or questions, please open an issue on GitHub.

---

**Built with ❤️ for Odoo x Amalthea 2025 Hackathon**
