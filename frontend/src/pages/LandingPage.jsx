// Public marketing landing page at "/". Authenticated visitors are redirected
// to their role's dashboard; everything here is real product capability — no
// fabricated metrics, testimonials or feature claims.

import { Navigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  Users,
  CalendarCheck,
  CalendarClock,
  Wallet,
  BarChart3,
  ShieldCheck,
  FileDown,
  ArrowRight,
  LayoutGrid,
} from "lucide-react";
import WorkZenLogo from "../components/WorkZenLogo";
import "../styles/Landing.css";

const MODULES = [
  {
    icon: Users,
    title: "Employee Management",
    text: "Central directory with roles, departments, codes and self-service profiles — searchable at 1,000-employee scale.",
  },
  {
    icon: CalendarCheck,
    title: "Real-Time Attendance",
    text: "IST check-in/out with server-computed worked, late and half-day minutes — plus streamed CSV exports for any date range.",
  },
  {
    icon: CalendarClock,
    title: "Multi-Stage Leave Approvals",
    text: "Weekday-aware applications, balance tracking, approval/rejection with reasons, cancellation with automatic restoration.",
  },
  {
    icon: Wallet,
    title: "Configurable Salary Structures",
    text: "Effective-dated component structures — fixed and percentage-based — resolved per employee and per period.",
  },
  {
    icon: FileDown,
    title: "Payroll Runs & PDF Payslips",
    text: "Period payroll generation from attendance and approved leave, with downloadable PDF payslips per employee.",
  },
  {
    icon: BarChart3,
    title: "Role-Based Analytics Reports",
    text: "Daily attendance, payroll period and leave reports with CSV export — scoped to what each role may actually see.",
  },
];

const ROLES = [
  {
    name: "Admin",
    tone: "indigo",
    points: [
      "Full organizational visibility",
      "User creation, status & deletion",
      "Attendance corrections with audit trail",
    ],
  },
  {
    name: "HR Officer",
    tone: "emerald",
    points: [
      "Leave approvals & organization requests",
      "Attendance views, exports & corrections",
      "Employee directory access",
    ],
  },
  {
    name: "Payroll Officer",
    tone: "amber",
    points: [
      "Salary structures & components",
      "Payroll generation & payment status",
      "Attendance & payroll reporting",
    ],
  },
  {
    name: "Employee",
    tone: "sky",
    points: [
      "Self-service attendance & check-in",
      "Leave balance, applications & cancels",
      "Own payslips as JSON or PDF",
    ],
  },
];

const LandingPage = () => {
  const { user } = useAuth();

  // Authenticated users never see marketing content — straight to their space.
  if (user) {
    if (user.role === "Employee") return <Navigate to="/employee/dashboard" replace />;
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="landing-page">
      <header className="landing-nav">
        <div className="landing-nav-inner">
          <WorkZenLogo size={36} />
          <nav className="landing-nav-links" aria-label="Sections">
            <a href="#features">Features</a>
            <a href="#roles">Roles</a>
            <a href="#security">Security</a>
          </nav>
          <div className="landing-nav-actions">
            <Link to="/login" className="landing-ghost-btn">
              Sign In
            </Link>
            <Link to="/login" className="landing-cta-btn">
              Launch Demo
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="landing-hero">
          <span className="landing-eyebrow">WorkZen HRMS · internal platform</span>
          <h1 className="landing-title">
            Unified Workforce, Attendance, Leave &amp;{" "}
            <span className="landing-title-accent">Payroll Operations</span>
          </h1>
          <p className="landing-subtitle">
            One role-aware system for your whole organization: IST-accurate
            attendance, multi-stage leave approvals, effective-dated salary
            structures and automated payroll — every calculation
            server-authoritative, every sensitive mutation audited.
          </p>
          <div className="landing-hero-actions">
            <Link to="/login" className="landing-cta-btn">
              Sign In to Workspace <ArrowRight size={16} />
            </Link>
            <a href="#roles" className="landing-ghost-btn">
              Explore Role Capabilities
            </a>
          </div>

          <div className="landing-preview wz-card" aria-label="Integrated modules preview">
            {[
              { icon: Users, label: "Employee Directory" },
              { icon: CalendarCheck, label: "IST Attendance" },
              { icon: CalendarClock, label: "Leave Workflows" },
              { icon: Wallet, label: "Automated Payroll & PDF Payslips" },
            ].map(({ icon: Icon, label }) => (
              <div className="landing-preview-item" key={label}>
                <Icon size={18} aria-hidden="true" />
                <span>{label}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="landing-section" id="features">
          <h2 className="landing-section-title">Everything the back office runs on</h2>
          <p className="landing-section-sub">
            Six integrated modules, one source of truth, zero spreadsheets.
          </p>
          <div className="landing-grid">
            {MODULES.map(({ icon: Icon, title, text }) => (
              <article className="landing-card wz-card" key={title}>
                <span className="landing-card-icon">
                  <Icon size={20} aria-hidden="true" />
                </span>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-section" id="roles">
          <h2 className="landing-section-title">Four roles, precise boundaries</h2>
          <p className="landing-section-sub">
            Every endpoint is guarded server-side — the UI only shows what each
            role may actually do.
          </p>
          <div className="landing-grid landing-grid-4">
            {ROLES.map((role) => (
              <article className={`landing-card landing-role landing-role-${role.tone} wz-card`} key={role.name}>
                <h3>{role.name}</h3>
                <ul>
                  {role.points.map((point) => (
                    <li key={point}>
                      <LayoutGrid size={11} aria-hidden="true" /> {point}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-section landing-security" id="security">
          <ShieldCheck size={22} aria-hidden="true" />
          <h2 className="landing-section-title">Security built in, not bolted on</h2>
          <p className="landing-section-sub">
            JWT sessions with server-side revocation and a 24-hour absolute cap ·
            SHA-256-hashed reset codes · per-account brute-force throttles ·
            Helmet CSP · rate limiting · a complete audit trail on sensitive
            mutations.
          </p>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <WorkZenLogo size={30} withSubtitle={false} />
          <nav className="landing-footer-links" aria-label="Footer">
            <a href="#features">Features</a>
            <a href="#roles">Roles</a>
            <Link to="/login">Sign In</Link>
          </nav>
          <span className="landing-stack">React · Node.js · Express · MySQL</span>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
