# WorkZen HRMS - Backend

Smart Human Resource Management System - Backend API

## Tech Stack

- **Node.js** + **Express.js** - Backend framework
- **MySQL** - Relational database
- **JWT** - Authentication
- **bcryptjs** - Password hashing

## Database Architecture

### Core Tables

1. **roles** - User role management (Admin, HR Officer, Payroll Officer, Employee)
2. **users** - User authentication and accounts
3. **employee_profiles** - Detailed employee information
4. **attendance** - Daily attendance tracking with check-in/check-out
5. **leave_types** - Different types of leaves
6. **leave_balance** - Employee leave allocations and usage
7. **leave_applications** - Leave requests and approvals
8. **salary_components** - Salary component definitions (earnings/deductions)
9. **employee_salary_structure** - Individual employee salary structures
10. **payroll** - Monthly payroll records
11. **payroll_details** - Detailed breakdown of payroll components
12. **audit_logs** - System activity audit trail

### Key Features

- **Foreign Key Relationships** for data integrity
- **Indexes** for optimized queries
- **Views** for complex queries
- **Triggers** for automatic calculations
- **Stored Procedures** for business logic

## Installation

1. **Install Dependencies**
   ```bash
   cd backend
   npm install
   ```

2. **Configure Environment**
   
   Copy `.env.example` to `.env` and update:
   ```env
   DB_HOST=localhost
   DB_USER=root
   DB_PASSWORD=your_password
   DB_NAME=workzen_hrms
   JWT_SECRET=your_secret_key
   ```

3. **Initialize Database**
   ```bash
   npm run init-db
   ```
   
   This will:
   - Create the database
   - Create all tables with relationships
   - Insert default roles and leave types
   - Set up views, triggers, and procedures

4. **Start Server**
   ```bash
   npm run dev
   ```

   Server runs on: `http://localhost:5000`

   ## Demo Users

   Run `npm run seed:demo` to create or refresh local demo accounts:

   | Role | Email | Password |
   |---|---|---|
   | Admin | `admin@workzen.demo` | `Admin@123` |
   | HR Officer | `hr@workzen.demo` | `Hr@123` |
   | Payroll Officer | `payroll@workzen.demo` | `Payroll@123` |
   | Employee | `employee@workzen.demo` | `Employee@123` |

## API Endpoints

### Authentication (`/api/auth`)

- `POST /register` - Register new user
- `POST /login` - User login
- `GET /me` - Get current user profile
- `POST /logout` - Logout user

### Users (`/api/users`)

- `GET /` - Get all users (Admin/HR)
- `GET /profile/:userId` - Get user profile
- `PUT /profile/:userId` - Update profile
- `PUT /:userId/status` - Update user status (Admin)

### Attendance (`/api/attendance`)

- `POST /check-in` - Employee check-in
- `POST /check-out` - Employee check-out
- `GET /status` - Current employee status
- `GET /today` - Today's employee records
- `GET /my-logs` - Paginated employee history
- `GET /summary` - Monthly employee summary
- `GET /day` - Paginated daily records for HR/Admin/Payroll
- `GET /all` - Paginated HR/Admin records with filters
- `GET /export` - Filtered CSV export for HR/Admin
- `PUT /:attendanceId` - Audited HR/Admin correction
- `DELETE /:attendanceId` - Admin deletion

Admin list filters include `page`, `limit`, `search`, `status`, `department`,
`startDate`, and `endDate`. The maximum page size is 100.

Attendance rules default to `Asia/Kolkata`, 09:00 expected start, 18:00
expected end, 15-minute late grace, and a 240-minute half-day threshold.
Override them with the `APP_TIMEZONE` and `ATTENDANCE_*` environment variables.

### Leave (`/api/leave`)

- `POST /apply` - Apply for leave
- `GET /my-leaves` - Get my leave applications
- `GET /all` - Get all leaves (Admin/HR)
- `PUT /:leaveId/status` - Approve/Reject leave (Admin/HR)
- `GET /balance` - Get leave balance
- `GET /types` - Get leave types

### Payroll (`/api/payroll`)

- `GET /my-payroll` - Get my payroll records
- `GET /payslip/:payrollId` - Get detailed payslip
- `GET /all` - Get all payroll (Admin/Payroll Officer)
- `POST /generate` - Generate payroll (Admin/Payroll Officer)
- `PUT /:payrollId/status` - Update payment status
- `GET /components` - Get salary components

### Dashboard (`/api/dashboard`)

- `GET /stats` - Get admin dashboard statistics (Admin/HR)
- `GET /my-stats` - Get employee dashboard

## Authentication

All protected routes require JWT token in header:

```
Authorization: Bearer <token>
```

## Role-Based Access Control

- **Admin** - Full system access
- **HR Officer** - Employee, attendance, and leave management
- **Payroll Officer** - Payroll and salary management
- **Employee** - View own records and apply for leave

## Database Schema Highlights

### Entity Relationships

```
users (1) ←→ (1) employee_profiles
users (1) ←→ (N) attendance
users (1) ←→ (N) leave_applications
users (1) ←→ (N) payroll
users (1) ←→ (N) leave_balance
users (N) ←→ (1) roles
leave_applications (N) ←→ (1) leave_types
payroll (1) ←→ (N) payroll_details
payroll_details (N) ←→ (1) salary_components
```

### Key Constraints

- Unique email per user
- Unique attendance per user per date
- Foreign keys with CASCADE/RESTRICT as appropriate
- Check constraints for data validation

## Error Handling

Standardized error responses:

```json
{
  "success": false,
  "message": "Error description"
}
```

## Development

```bash
npm run dev  # Start with nodemon
npm start    # Start production server
```

## Project Structure

```
backend/
├── src/
│   ├── config/
│   │   └── database.js         # Database connection
│   ├── controllers/
│   │   └── authController.js   # Authentication logic
│   ├── database/
│   │   ├── schema.sql          # Complete database schema
│   │   └── init.js             # Database initialization
│   ├── middleware/
│   │   ├── auth.js             # JWT & role verification
│   │   └── errorHandler.js     # Error handling
│   ├── models/
│   │   ├── userModel.js        # User data access
│   │   └── profileModel.js     # Profile data access
│   └── routes/
│       ├── authRoutes.js       # Auth endpoints
│       ├── userRoutes.js       # User endpoints
│       ├── attendanceRoutes.js # Attendance endpoints
│       ├── leaveRoutes.js      # Leave endpoints
│       ├── payrollRoutes.js    # Payroll endpoints
│       └── dashboardRoutes.js  # Dashboard endpoints
├── .env                        # Environment variables
├── server.js                   # Express server
└── package.json                # Dependencies
```

## Security Features

- Password hashing with bcrypt
- JWT token-based authentication
- Role-based authorization
- SQL injection prevention (parameterized queries)
- CORS configuration
- Environment variable protection

## Testing

Health check endpoint:
```
GET http://localhost:5000/api/health
```

Expected response:
```json
{
  "success": true,
  "message": "WorkZen HRMS Backend is running",
  "timestamp": "2025-11-08T..."
}
```
