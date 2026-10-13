# WorkZen HRMS - Interview Preparation Pack

## 1. Technology & Feature Breakdown

### React 18 & Vite (Frontend)
1. **What it is**: A modern JavaScript library for building UIs, bundled by Vite for fast development and optimized production builds.
2. **Where you used it**: The entire frontend (`frontend/src`), handling all user interfaces for Admin, HR, Payroll, and Employees.
3. **Why you used it**: React provides a component-based architecture for reusability. Vite replaces Webpack (like in Create-React-App) for significantly faster Hot Module Replacement (HMR) and build times.
4. **How it works in your project**: React components fetch data from the Express backend via Axios. React Router DOM handles navigation. State is managed locally or via context (depending on your setup).
5. **What an interviewer can ask**: "Why did you choose Vite over Create React App?"
6. **Concise answer**: "CRA uses Webpack, which bundles the entire application before serving it, leading to slow startup times in large apps. Vite leverages native ES modules in the browser, serving code on-demand and drastically improving startup and hot-reload times."
7. **Likely follow-up**: "How does React 18's concurrent rendering improve your HRMS?"
8. **Strong answer**: "React 18 introduces features like batching state updates automatically and `useTransition`. While not heavily exploiting concurrency yet, it ensures our complex data grids (like attendance history) don't block the main thread during renders."
9. **Weakness/Red Flag**: ⚠️ INTERVIEW RISK - If you haven't implemented pagination or virtualization for large employee lists, they might point out rendering performance issues.

### Node.js & Express (Backend APIs)
1. **What it is**: A JavaScript runtime and minimal web framework for building REST APIs.
2. **Where you used it**: The entire backend (`backend/src`), serving all API routes (`/api/attendance`, `/api/leave`, etc.).
3. **Why you used it**: Enables a unified JavaScript stack (MERN-style, but with MySQL). Express is lightweight, flexible, and has a massive middleware ecosystem.
4. **How it works in your project**: Uses a "Thin Controller, Fat Service" pattern. Express routes pass requests to controllers, which validate input and immediately call `*Service.js` files (like `attendanceService.js`) where the actual business logic and DB queries live.
5. **What an interviewer can ask**: "Explain your API architecture pattern."
6. **Concise answer**: "I decoupled HTTP concerns from business logic. Controllers only handle req/res and validation. Services handle calculations and DB interactions. This makes the business logic highly testable."
7. **Likely follow-up**: "How do you handle unhandled promise rejections or async errors in Express?"
8. **Strong answer**: "I use a global error-handling middleware (`errorHandler.js`). Async routes are either wrapped in a `try/catch` block that calls `next(error)`, or I use a package like `express-async-handler` to pass errors automatically to the centralized handler."
9. **Weakness/Red Flag**: 🚨 MUST UNDERSTAND BEFORE INTERVIEW - Make sure you know exactly how `errorHandler.js` is implemented in your repo and how it formats error responses.

### MySQL & Parameterized Queries (Database)
1. **What it is**: A relational database management system. `mysql2` is the Node.js driver used.
2. **Where you used it**: `backend/src/database/schema.sql` and all service layer queries.
3. **Why you used it**: HR data (Users, Leave Balances, Attendance) is highly structured and relational. MySQL ensures ACID compliance, crucial for things like leave balance deductions.
4. **How it works in your project**: Uses the `mysql2` package with Promises. Complex schemas with foreign keys (`user_id`, `role_id`). Uses Views (like `view_monthly_attendance`) to simplify complex aggregations.
5. **What an interviewer can ask**: "Why MySQL instead of MongoDB for this project?"
6. **Concise answer**: "HR data is inherently relational. An employee has a strict relationship with their attendance records, leave balances, and payroll. Enforcing these constraints (Foreign Keys) at the database level prevents orphaned data and ensures data integrity, which is harder to guarantee in a NoSQL database."
7. **Likely follow-up**: "How do you prevent SQL injection?"
8. **Strong answer**: "I exclusively use parameterized queries (prepared statements) provided by the `mysql2` driver. I never concatenate user input directly into SQL strings."
9. **Weakness/Red Flag**: ⭐ INTERVIEW STRENGTH - Your use of `unique_user_attendance_date` to prevent duplicate check-ins is a great database-level safeguard. Mention it!

### JWT & RBAC (Authentication & Security)
1. **What it is**: JSON Web Tokens for stateless authentication, combined with Role-Based Access Control.
2. **Where you used it**: `backend/src/middleware/auth.js` and user login.
3. **Why you used it**: To secure APIs without storing session state on the server, making the backend stateless and easier to scale.
4. **How it works**: On login, `bcryptjs` verifies the password. A JWT is signed containing the user's ID and role. Middleware on protected routes verifies the token signature and checks if the user's role (Admin, HR, Employee) is authorized for that endpoint.
5. **What an interviewer can ask**: "How does your RBAC middleware work?"
6. **Concise answer**: "The auth middleware decodes the JWT and attaches the user object to the request. A secondary middleware function accepts an array of allowed roles, checks the user's role against it, and either calls `next()` or returns a 403 Forbidden."
7. **Likely follow-up**: "Where do you store the JWT on the frontend, and what are the security implications?"
8. **Strong answer**: "Currently, it might be in localStorage for simplicity, but that exposes it to XSS attacks. The most secure approach would be an `HttpOnly` secure cookie, which prevents JavaScript access while still sending the token automatically with requests."
9. **Weakness/Red Flag**: ⚠️ INTERVIEW RISK - If you store tokens in `localStorage`, acknowledge the XSS risk.

### Attendance & Leave Modules (Core Business Logic)
1. **What it is**: The primary features of the HRMS (Milestones 1A-1C and 2A-2D).
2. **Where you used it**: `attendanceService.js`, `leaveService.js`, and respective DB tables.
3. **Why you used it**: To automate HR tracking accurately.
4. **How it works**: Attendance calculations (late minutes, half-days) are done **strictly on the backend**. Leave overlaps are checked via SQL queries before allowing an application.
5. **What an interviewer can ask**: "Why calculate attendance hours on the server instead of the client?"
6. **Concise answer**: "Client-side data cannot be trusted. A user could manipulate the JavaScript or intercept the API call to alter their check-in time or worked hours. The server must be the absolute source of truth."
7. **Likely follow-up**: "How do you handle a user applying for leave on overlapping dates?"
8. **Strong answer**: "Before inserting a leave application, the service queries the database for any existing applications for that `user_id` where the date range overlaps with the requested range. If a match is found, the transaction is aborted and an error is returned."
9. **Weakness/Red Flag**: 🚨 MUST UNDERSTAND BEFORE INTERVIEW - You must know exactly how the SQL overlap query works (e.g., `start_date <= requested_end AND end_date >= requested_start`).

---

## 2. The Pitches

### 30-Second Pitch
"WorkZen is a full-stack Human Resource Management System I built using React and Node.js with a MySQL database. It handles complex HR workflows like role-based access, automated attendance tracking with server-side time calculations, and a complete leave management system with balance deductions and email notifications. I focused heavily on data integrity and decoupled architecture."

### 60-Second Pitch
"I developed WorkZen HRMS to solve the complexities of employee management. The frontend is a fast, responsive React 18 SPA built with Vite. The backend is an Express REST API backed by a highly normalized MySQL database. 
I successfully implemented two major modules: Attendance and Leave. The Attendance system ensures one record per employee per day at the database level and calculates late arrivals and half-days securely on the server. The Leave module features a robust state machine for approvals, preventing overlapping dates and automatically adjusting database-backed balances. Security is enforced via JWT and strict Role-Based Access Control middleware. Everything is tracked in an audit log for compliance."

### 2-Minute Pitch
*(Combine the 60-second pitch with the following)*:
"One of my main architectural decisions was separating concerns on the backend. I implemented a 'Thin Controller, Fat Service' pattern, keeping Express routing logic completely separate from business rules. For the database, I chose MySQL because HR data is strictly relational—using foreign keys ensures we don't have orphaned leave requests if a user is deleted. 
I also built in transaction safety for manual HR corrections and automated non-blocking email notifications using Nodemailer. I'm currently laying the groundwork for a payroll module that will generate dynamic PDFs. Overall, I treated this as an enterprise-grade application, focusing on security, performance, and uncompromised data integrity."

---

## 3. Deep Explanations

### Architecture Explanation
**"Walk me through your architecture."**
"It's a decoupled 2-tier architecture. The client is a React Single Page Application (SPA) that communicates entirely via JSON over HTTP to a Node.js/Express REST API. 
The backend is structured in layers: Routes -> Auth/RBAC Middleware -> Controllers (validation & request parsing) -> Services (business logic) -> Data Access (parameterized SQL queries via `mysql2`). This keeps concerns separated and makes the code modular. The database is MySQL, acting as the single source of truth."

### Database Explanation
**"Walk me through your database schema."**
"The schema is highly normalized. It centers around a `users` table for authentication, which links to `roles` for RBAC. User details are kept separate in `employee_profiles` (1-to-1). 
For tracking, we have `attendance` (1-to-many from users) with unique constraints per day. Leave is split into `leave_types` (lookup), `leave_balance` (tracking remaining days per year), and `leave_applications`. By enforcing foreign keys with `ON DELETE CASCADE` or `RESTRICT`, the database maintains referential integrity automatically."

### Authentication Explanation
**"How does your auth work?"**
"It's stateless JWT authentication. A user logs in, the backend hashes the provided password with `bcrypt` and compares it to the DB. If successful, it signs a JWT containing the `user_id` and `role_id` and sends it back. For protected routes, an Express middleware extracts the token from the Authorization header, verifies the secret signature, and attaches the user data to `req.user`. A secondary middleware checks `req.user.role_id` against permitted roles."

### API Explanation
**"How did you design your APIs?"**
"I followed RESTful principles. Resources are represented by nouns (`/api/attendance`, `/api/leave`). I use appropriate HTTP methods: GET for fetching history, POST for check-ins or applying for leave, PUT/PATCH for HR approvals. Responses follow a consistent JSON structure (e.g., `{ success: true, data: {...} }`), and errors return proper HTTP status codes (400 for bad input, 401 for unauthorized, 403 for forbidden, 404 for not found)."

---

## 4. Key Project Narrative

### Most Difficult Technical Challenge
**The Challenge**: Ensuring absolute accuracy in Attendance and Leave calculations while preventing race conditions (e.g., double-clicking "Apply Leave" or "Check In").
**The Solution**: Pushing constraints to the database layer. I implemented `UNIQUE` constraints (e.g., `unique_user_attendance_date`) so the DB physically rejects duplicate daily check-ins. For leave, I check balances and overlaps within a SQL transaction, ensuring atomic operations.

### Most Impressive Technical Feature
⭐ **INTERVIEW STRENGTH**: The automated, server-side Attendance calculation engine. Instead of trusting client timestamps, the server records the exact `DATETIME` of the request, calculates minutes worked against the configurable company start/end times (e.g., 09:00 to 18:00), applies a 15-minute grace period, and automatically flags "Half-Day" or "Late" statuses without HR intervention.

### Biggest Weakness
**Honest reflection**: "Because the application grew quickly, state management on the React frontend became slightly scattered between local state and context. If I had to redo it, I would integrate Redux Toolkit or React Query from the start to cache API responses and manage global state more predictably."

### Future Improvements
"I have the DB schema ready for Payroll. My next step is fully implementing the Payroll engine, which will aggregate attendance data and leave data to calculate gross/net salary based on configurable `salary_components`, and then use `pdfkit` to generate and email payslips securely."

---

## 5. Question Banks

### Top 50 Likely Project Questions
1. What does your application do?
2. Why did you choose the MERN-ish stack (React + Node + MySQL)?
3. How did you structure your Git repository?
4. Explain the folder structure of your React app.
5. Explain the folder structure of your Express backend.
6. How did you handle environment variables?
7. What happens if I try to check in twice on the same day?
8. How do you handle password encryption?
9. Explain how you implemented Role-Based Access Control.
10. How do HR admins approve leave?
11. What happens when leave is rejected?
12. How did you implement email notifications?
13. Is the email sending blocking the API response? (Ans: Should be async)
14. How are you handling CORS?
15. Why use Vite over CRA?
16. How did you implement routing in React?
17. How do you protect routes on the frontend?
18. How do you protect routes on the backend?
19. Explain your database schema for Leave Management.
20. Why are `users` and `employee_profiles` separate tables?
21. What is the `audit_logs` table used for?
22. How do you prevent SQL injection?
23. How do you handle pagination in your APIs?
24. Explain the "Thin Controller" pattern.
25. How do you handle database migrations or schema updates?
26. How do you calculate late arrivals?
27. Where is the timezone configuration handled?
28. How does the CSV export feature work?
29. How do you handle weekend detection for leave applications?
30. What happens if a user requests 5 days of leave but only has 3 left?
31. How do you handle unhandled exceptions in Node?
32. What HTTP status code do you return for validation errors?
33. What validation library did you use? (`express-validator`)
34. How did you style the application?
35. How is the navigation sidebar controlled based on roles?
36. What would you do if a database query is slow?
37. How do you manage API URLs between dev and production?
38. Did you write any tests for this project?
39. What is the purpose of the `view_monthly_attendance` SQL View?
40. How do you handle cascading deletes?
41. What is the difference between authorization and authentication in your app?
42. How are you storing the JWT on the client?
43. What is the lifespan of your JWT?
44. How would you implement a token refresh mechanism?
45. Why did you freeze the Leave module at Milestone 2D?
46. What is unpaid-leave neutrality?
47. What happens if the Nodemailer SMTP server is down?
48. How do you handle file uploads for profile pictures?
49. What was the most frustrating bug you encountered?
50. If you had 2 more weeks, what would you add?

### Top 25 Deep-Dive Questions
1. Walk me through the exact SQL query used to check for overlapping leave.
2. Explain how Javascript closures are utilized in your Express middlewares.
3. If an employee submits 100 concurrent leave requests in 1 second, what happens? (Race conditions / DB Locks)
4. How exactly does `bcrypt.compare` work under the hood?
5. How would you migrate your `mysql2` setup to use a connection pool?
6. Explain the event loop in Node.js and how it handles your DB calls.
7. How does React 18's virtual DOM diffing handle your large attendance tables?
8. Explain the difference between `useEffect` and `useLayoutEffect` and which you used.
9. How would you refactor your Context API to Redux?
10. How is your JWT signed? (What algorithm, e.g., HS256)
11. If someone steals a JWT, how can you invalidate it before it expires?
12. Walk me through implementing a SQL transaction for leave approval.
13. How do you handle database index optimization in your schema?
14. Explain the difference between `DATETIME` and `TIMESTAMP` in MySQL.
15. How would you handle a distributed denial of service (DDoS) attack on your check-in endpoint?
16. How do you mock the database during unit testing?
17. What is the algorithmic complexity of your leave overlap detection?
18. How does `pdfkit` stream data, and why is streaming better than buffering?
19. How would you implement WebSocket for real-time HR notifications?
20. How do you handle memory leaks in a Node.js server?
21. Explain the exact mechanism of Cross-Site Request Forgery (CSRF) and if your app is vulnerable.
22. How does Vite bundle assets differently for production vs dev?
23. If the DB schema changes, how do you handle zero-downtime deployments?
24. Walk me through the implementation of `express-validator`.
25. How do you handle timezones? If a server is in UTC and a user is in India, how is check-in time recorded?

### Top 20 JS/React Questions (Implementation Specific)
1. How does React handle state updates asynchronously?
2. What are React hooks, and which ones did you use most?
3. How did you prevent unnecessary re-renders in your data tables?
4. Explain Prop Drilling and how you avoided it.
5. What is the Context API used for in WorkZen?
6. How does React Router v6 differ from v5 in your implementation?
7. Explain how Axios interceptors handle your auth tokens.
8. What is the difference between `null` and `undefined` in your API responses?
9. How do you handle deeply nested object state in React?
10. Explain Promises and `async/await` in your frontend service calls.
11. How do you conditionally render UI elements based on `role_id`?
12. What is the virtual DOM?
13. How do you handle forms and form validation in React?
14. Explain array methods `map`, `filter`, and `reduce` and where you used them (e.g., calculating totals).
15. What are React fragments?
16. How do you clean up side effects in `useEffect`?
17. What is event delegation in the DOM?
18. How does Vite handle CSS imports?
19. What is strict mode in React 18?
20. How would you lazy load components to improve initial load time?

### Top 20 Node/Express Questions (Implementation Specific)
1. Explain the middleware pattern in Express.
2. How does `next()` work?
3. How does Node.js handle concurrency if it's single-threaded?
4. What is `module.exports` vs ES6 `export`? (Your backend uses `"type": "module"`)
5. Explain how you parse JSON request bodies.
6. How do you handle multipart/form-data for profile pictures?
7. What is the purpose of `dotenv`?
8. Explain how Nodemailer integrates with the Node event loop.
9. How do you read/write files in Node? (Related to CSV export or PDF generation).
10. What is `req.params` vs `req.query` vs `req.body`?
11. How do you set HTTP headers in Express?
12. Explain the purpose of `package-lock.json`.
13. How do you handle uncaught exceptions?
14. What is the `morgan` package used for? (Logging)
15. How do you configure CORS in Express securely?
16. Explain the difference between `fs.readFile` and `fs.createReadStream`.
17. How does garbage collection work in V8?
18. How do you gracefully shut down an Express server?
19. What is the role of `nodemon`?
20. How would you implement rate limiting in Express?

### Top 20 MySQL/DBMS Questions (Implementation Specific)
1. What is normalization? What normal form is your schema in?
2. Explain INNER JOIN vs LEFT JOIN. Where did you use them?
3. What is a Foreign Key constraint? How does `ON DELETE CASCADE` work in your DB?
4. What is an Index? Which columns did you index and why?
5. Explain ACID properties in the context of your leave approval transaction.
6. What is a SQL View? Why did you create `view_monthly_attendance`?
7. How does a `UNIQUE` constraint differ from a Primary Key?
8. What is the difference between `WHERE` and `HAVING`?
9. How do you group data? (e.g., `GROUP BY` in attendance summary).
10. How does SQL injection happen, and how do parameterized queries stop it?
11. What is an ENUM? Why use it for status fields?
12. Explain the difference between `DATETIME` and `DATE` data types.
13. How would you optimize a slow query on the `audit_logs` table?
14. What are triggers in MySQL? Did you use any?
15. Explain connection pooling.
16. What happens if you forget a `WHERE` clause in an `UPDATE`?
17. How do you handle pagination at the database level? (`LIMIT` and `OFFSET`)
18. What is the difference between `DECIMAL` and `FLOAT` for salary calculations?
19. Explain how you designed the `leave_balance` composite unique key.
20. How do you backup and restore a MySQL database?

### Top 15 Security Questions
1. How does `bcrypt` salting work?
2. What makes JWT secure if anyone can decode the payload?
3. What is Cross-Site Scripting (XSS)? How does React prevent it?
4. Where is the safest place to store a JWT on the client?
5. What is CORS and why is it a browser security feature, not a server security feature?
6. How do you prevent Brute Force attacks on the login endpoint?
7. What is the principle of least privilege? (Relates to your RBAC).
8. Why shouldn't you log passwords in your `audit_logs`?
9. How do you secure database credentials?
10. What is SQL Injection?
11. How do you ensure users can't modify other users' attendance records?
12. What is Man-in-the-Middle (MitM) and how does HTTPS prevent it?
13. Explain IDOR (Insecure Direct Object Reference) and how your API prevents it.
14. Why do password reset codes expire?
15. How do you validate file uploads to prevent malicious scripts?

### Top 10 Scalability Questions
1. How would you scale the Node.js backend horizontally? (Cluster module or Docker/K8s)
2. If the DB becomes the bottleneck, how do you scale MySQL? (Read replicas)
3. How would you implement caching for the `leave_types` which rarely change? (Redis)
4. What happens when the `audit_logs` table gets to 100 million rows? (Partitioning)
5. How would you offload PDF generation from the main Express server? (Message queues/Worker threads)
6. How do you serve the React frontend at scale? (CDN)
7. How do connection pools help scale database traffic?
8. How would you implement a microservices architecture for this app?
9. What is a load balancer?
10. How do you handle server-side pagination for a million employees?

---

## 15-MINUTE PROJECT REVISION SHEET

*Read this right before you walk into the interview.*

**Project Identity**: WorkZen HRMS. Full-stack React 18 + Node.js/Express + MySQL.
**Architecture**: React SPA -> Axios -> Express REST API -> mysql2 -> MySQL DB.
**Security**: JWT (Stateless), `bcryptjs` (Password hashing), RBAC Middleware (Admin, HR, Payroll, Employee).

**Core Features & DB Mechanisms**:
- **Attendance**:
  - Enforced by DB: `unique_user_attendance_date`.
  - Logic: Calculated on the **backend**. Timezone defaults to `Asia/Kolkata`.
  - Statuses: Present, Absent, Half-Day, Late.
- **Leave Management**:
  - Core tables: `leave_types`, `leave_balance`, `leave_applications`.
  - Workflow: Pending -> HR Approval -> Balance Deducted.
  - Overlap: Checked via SQL before insert to prevent booking same days twice.
  - Notifications: Nodemailer (async).

**Key Code Patterns**:
- **Thin Controller, Fat Service**: Routes/Controllers just handle HTTP and validation. `attendanceService.js` handles all the heavy lifting.
- **Error Handling**: Centralized `errorHandler.js` catches all exceptions.
- **SQL Injection Prevention**: 100% Parameterized queries using `mysql2`.

**Your Stance (If Challenged)**:
- "I chose MySQL because HR data requires strict relational integrity (Foreign Keys)."
- "I calculate time on the backend because client data cannot be trusted."
- "I used Vite because CRA is slow and deprecated."

🚨 **REMEMBER**: Do NOT say you used MongoDB. Do NOT say you calculate late hours on the frontend. Do NOT confuse `users` (auth data) with `employee_profiles` (HR data).
