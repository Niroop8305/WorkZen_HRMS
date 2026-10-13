# WorkZen HRMS - Project Interview Master Guide

## Table of Contents
1. [30/60/120 Second Pitches](#3060120-second-pitches)
2. [Architecture & Tech Stack](#architecture--tech-stack)
3. [Key Modules & Milestones](#key-modules--milestones)
4. [Database & Data Flow](#database--data-flow)
5. [Must-Know Checklist](#must-know-checklist)
6. [Top 50 Questions](#top-50-questions)
7. [Red Flags to Avoid](#red-flags-to-avoid)

---

## 30/60/120 Second Pitches

### 30-Second Pitch
"WorkZen HRMS is a comprehensive Human Resource Management System built with a React frontend and Node/Express backend, backed by MySQL. It currently features robust, verified modules for Attendance tracking and Leave management, utilizing JWT/RBAC middleware for security. The system emphasizes accurate, server-side data calculations to ensure the integrity of HR records."

### 60-Second Pitch
"WorkZen HRMS is a modern, full-stack application designed to streamline HR operations. The frontend is built with React 18 and Vite, consuming REST APIs from a Node.js Express backend. We use MySQL for our relational data. Our Attendance module supports configurable timezones, rules, and server-side calculations for worked hours and late arrivals. Our Leave module features database-backed balances, workflow approvals, overlapping detection, and email notifications. The system uses strict Role-Based Access Control (Admin, HR, Payroll, Employee) to ensure data is accessed and modified securely, logging critical actions to an audit log."

### 120-Second Pitch
"WorkZen HRMS is an enterprise-ready HR system that tackles the complexities of employee management. The architecture is a decoupled React single-page application and a Node.js REST API. 
For Attendance (Milestone 1A-1C), we implemented one record per user per day with a unique constraint, protecting data integrity. The backend completely handles check-in/out logic, including late grace periods and half-day thresholds, so the client never manipulates authoritative time data. 
For Leave management (Milestone 2A-2D), we've built a robust state machine from 'Pending' to 'Approved' or 'Rejected', strictly relying on core tables like `leave_types`, `leave_balance`, and `leave_applications`. It prevents overlap, auto-deducts paid balances, and sends Nodemailer-based non-blocking notifications. 
Our database schema is highly normalized with proper foreign key constraints. We've also included transaction-safe audited manual corrections. The codebase is tested and includes demo seeding for easy environment setup."

---

## Architecture & Tech Stack

- **Frontend**: React 18, Vite, React Router DOM, Axios, CSS/Tailwind (Tailwind v4 in package.json).
- **Backend**: Node.js, Express, JWT (jsonwebtoken), bcryptjs, mysql2, nodemailer, pdfkit.
- **Database**: MySQL. Schema strictly managed in `backend/src/database/schema.sql`.
- **Request Flow**: React -> Axios -> Express route -> JWT/RBAC middleware -> controller -> service (business logic) -> SQL/MySQL.

---

## Key Modules & Milestones

### 1. Attendance (Milestones 1A-1C - Verified)
- Configurable rules (Defaults: `Asia/Kolkata`, 09:00 - 18:00, 15m grace, 240m half-day).
- Enforced single row per user/date (`unique_user_attendance_date`).
- Server-side time calculations for accuracy.
- Export to CSV, paginated history, search/status/department filters.
- Audited manual corrections.

### 2. Leave Management (Milestones 2A-2D - Frozen)
- Core tables: `leave_types`, `leave_balance`, `leave_applications`.
- Weekday-only applications, overlap detection.
- Full approval/rejection workflows with paid balance deduction/restoration.
- Non-blocking email notifications (Nodemailer).
- Note: Legacy leave structures (`leave_requests`, `leave_allocations`) are deprecated and strictly avoided.

### 3. Payroll (Under Construction / Future)
- Involves `salary_components`, `employee_salary_structure`, `payroll`, `payroll_details`.
- PDF generation using `pdfkit`.
- Currently separated from core Attendance/Leave edits to prevent regressions.

---

## Database & Data Flow

### Core Schema Highlights
- `users`: Core auth with `role_id` linking to `roles`.
- `employee_profiles`: Detailed user info (DOB, department, etc).
- `attendance`: Date-based tracking with `check_in_time`, `check_out_time`, `status`.
- `leave_applications` & `leave_balance`: Relational constraints to ensure users can't take leave they don't have.
- `audit_logs`: Tracks critical changes across tables for HR compliance.

### Design Patterns
- **Thin Controllers / Fat Services**: Controllers handle HTTP req/res and validation, while `*Service.js` files (e.g., `attendanceService.js`) handle complex business logic.
- **Parameterized SQL**: Used extensively to prevent SQL injection.
- **Role-Based Access Control**: Middleware verifies JWTs and checks against allowed `role_id`s before executing controller logic.

---

## Must-Know Checklist

- [x] Know how to start the app: `cd backend; npm run dev` and `cd frontend; npm run dev`.
- [x] Know the demo accounts (Admin, HR, Payroll, Employee).
- [x] Understand the difference between `users` (auth) and `employee_profiles` (data).
- [x] Be able to explain the Attendance check-in flow (client request -> server timestamp -> DB insert/update).
- [x] Be able to explain the Leave application flow (check balance -> check overlap -> insert pending -> HR approve -> deduct balance).
- [x] Know that legacy payroll/leave tables exist but must be ignored/refactored cautiously.

---

## Top 50 Questions

*(A curated selection of the most critical questions for an interview)*

**Architecture & Setup**
1. What is the overall architecture of WorkZen?
2. Why Vite over Create React App?
3. How is the database initialized and seeded?
4. Explain the request lifecycle from React to the Database.
5. How do you handle environment variables?

**Backend & Node.js**
6. How is routing structured in the Express backend?
7. Explain the "Thin Controller, Fat Service" pattern used here.
8. How does the global error handler work?
9. Why use `mysql2` over `mysql`? (Promises/Async support)
10. How are email notifications handled without blocking the main thread?

**Security & Auth**
11. How is JWT implemented?
12. What role does `bcryptjs` play?
13. Explain the RBAC (Role-Based Access Control) middleware.
14. How are SQL injections prevented?
15. What is the purpose of the `audit_logs` table?

**Database & SQL**
16. How do you enforce one attendance record per day?
17. Explain the foreign key relationship between `users` and `employee_profiles`.
18. How do views (e.g., `view_monthly_attendance`) improve performance or simplicity?
19. What happens if a user is deleted? (Cascade deletes)
20. Why separate `leave_types` and `leave_balance`?

**Frontend & React**
21. How is state managed in the frontend?
22. How does React Router handle protected routes?
23. Explain how Axios interceptors might be used for JWT tokens.
24. How are components styled? (CSS/Tailwind)
25. How do you handle pagination on the frontend?

**Attendance Module**
26. How are late arrivals calculated?
27. Why must time calculations be done on the server?
28. How do you handle half-days?
29. Explain the CSV export functionality.
30. How are manual attendance corrections audited?

**Leave Module**
31. How is leave overlap detected?
32. Explain the process of leave cancellation.
33. How do weekend rules apply to leave days?
34. What happens to the balance when an application is rejected?
35. What is unpaid-leave neutrality?

*(Questions 36-50 cover standard HRMS domain logic, testing, and scaling)*
36. How is testing handled in the backend?
37. What is the `node --test` runner?
38. How do you isolate tests from the production database?
39. Explain the payroll PDF generation process.
40. How would you scale the Node backend?
41. How to deal with timezone differences for attendance?
42. What is the strategy for migrating legacy tables?
43. How do you handle concurrent leave applications? (Transactions)
44. Why freeze the Leave module at Milestone 2D?
45. Explain how you would implement a new salary component.
46. How are password resets handled?
47. What is the difference between Earning and Deduction in salary components?
48. How do you optimize the React frontend build?
49. What is the strategy for handling API rate limits?
50. If you had 2 weeks, what technical debt would you fix first?

---

## Red Flags to Avoid

- **Trusting the Client**: Never calculate attendance hours or leave balances on the frontend. The server must be the source of truth.
- **Using Legacy Tables**: Referencing `leave_requests` instead of `leave_applications` shows a lack of codebase understanding.
- **Fat Controllers**: Putting business logic in the Express controllers instead of `*Service.js`.
- **Skipping Transactions**: Updating leave balances without wrapping the application approval in a SQL transaction.
- **Ignoring the `AGENTS.md` Source of Truth**: Relying on stale READMES instead of actual DB schema and code.
