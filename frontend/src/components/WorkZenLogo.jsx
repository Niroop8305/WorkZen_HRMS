// Original WorkZen HRMS brand mark: a geometric W/Z monogram inside a rounded
// slate tile, with the wordmark and an optional "HRMS" subtitle. Replaces all
// third-party (Odoo) branding across the app.

const WorkZenLogo = ({ size = 36, withWordmark = true, withSubtitle = true, className = "" }) => {
  const tile = size;
  const mark = (
    <svg
      width={tile}
      height={tile}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={`${className}-mark`}
    >
      <rect x="1" y="1" width="46" height="46" rx="12" fill="#0f172a" stroke="rgba(148,163,184,0.25)" strokeWidth="1.5" />
      {/* Z-shaped stroke behind */}
      <path
        d="M13 15 H35 L13 33 H35"
        stroke="#6366f1"
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.85"
      />
      {/* W glyph in front */}
      <path
        d="M10 18 L15 31 L20 21 L25 31 L30 18"
        stroke="#f8fafc"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="37.5" cy="13.5" r="2.4" fill="#34d399" />
    </svg>
  );

  if (!withWordmark) return mark;

  return (
    <span className={`workzen-logo ${className}`} style={{ display: "inline-flex", alignItems: "center", gap: "10px" }}>
      {mark}
      <span className="workzen-logo-text" style={{ display: "inline-flex", flexDirection: "column", lineHeight: 1.1 }}>
        <span
          className="workzen-logo-word"
          style={{
            fontWeight: 700,
            fontSize: Math.round(tile * 0.52),
            color: "inherit",
            letterSpacing: "0.02em",
          }}
        >
          Work<span style={{ color: "#818cf8" }}>Zen</span>
        </span>
        {withSubtitle && (
          <span
            className="workzen-logo-sub"
            style={{
              fontSize: Math.max(10, Math.round(tile * 0.24)),
              color: "#94a3b8",
              fontWeight: 600,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
            }}
          >
            HRMS
          </span>
        )}
      </span>
    </span>
  );
};

export default WorkZenLogo;
