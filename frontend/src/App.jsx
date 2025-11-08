import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import AttendanceRouter from "./components/AttendanceRouter";
import SignIn from "./pages/SignIn";
import SignUp from "./pages/SignUp";
import Dashboard from "./pages/Dashboard";
import MyProfile from "./pages/MyProfile";
import "./styles/App.css";

function App() {
  return (
    <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider>
        <div className="app-container">
          <Routes>
            {/* Public Routes */}
            <Route path="/" element={<Navigate to="/login" />} />
            <Route path="/login" element={<SignIn />} />
            <Route path="/signup" element={<SignUp />} />

            {/* Protected Routes */}
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute
                  allowedRoles={["Admin", "HR Officer", "Payroll Officer"]}
                >
                  <Dashboard />
                </ProtectedRoute>
              }
            />

            <Route
              path="/employee/dashboard"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />

            {/* My Profile Route */}
            <Route
              path="/profile"
              element={
                <ProtectedRoute>
                  <MyProfile />
                </ProtectedRoute>
              }
            />

            {/* Attendance Route - Role-based routing */}
            <Route
              path="/attendance"
              element={
                <ProtectedRoute>
                  <AttendanceRouter />
                </ProtectedRoute>
              }
            />

            {/* Unauthorized Page */}
            <Route
              path="/unauthorized"
              element={
                <div className="auth-page">
                  <div className="auth-card text-center">
                    <h1
                      style={{ fontSize: "72px", color: "var(--odoo-purple)" }}
                    >
                      403
                    </h1>
                    <p style={{ fontSize: "20px", marginBottom: "20px" }}>
                      Access Denied
                    </p>
                    <p style={{ color: "#999", marginBottom: "30px" }}>
                      You don't have permission to access this page.
                    </p>
                    <a href="/login" className="btn btn-primary">
                      Go to Login
                    </a>
                  </div>
                </div>
              }
            />
            {/* 404 Page */}
            <Route
              path="*"
              element={
                <div className="auth-page">
                  <div className="auth-card text-center">
                    <h1
                      style={{ fontSize: "72px", color: "var(--odoo-purple)" }}
                    >
                      404
                    </h1>
                    <p style={{ fontSize: "20px", marginBottom: "20px" }}>
                      Page Not Found
                    </p>
                    <a href="/login" className="btn btn-primary">
                      Go to Login
                    </a>
                  </div>
                </div>
              }
            />
          </Routes>
        </div>
      </AuthProvider>
    </Router>
  );
}

export default App;
