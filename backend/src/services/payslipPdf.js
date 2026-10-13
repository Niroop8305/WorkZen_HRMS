import PDFDocument from "pdfkit";

// Server-side payslip PDF renderer (Milestone 4).
// Renders ONLY the historical payroll snapshot passed in. It never recalculates
// salary: every figure comes from the stored payroll / payroll_details records.

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const ACCENT = "#4f46e5";
const DARK = "#1f2937";
const MUTED = "#6b7280";
const LINE = "#e5e7eb";

const money = (value) => {
  const n = Number(value || 0);
  return `INR ${n.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const days = (value) => {
  const n = Number(value || 0);
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
};

const monthLabel = (month) => MONTHS[Number(month) - 1] || `Month ${month}`;

// mysql2 returns DATE columns as a JS Date at local midnight. Format with local
// getters (NOT toISOString) so the calendar day is not shifted by the TZ offset.
const formatDate = (value) => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

// Safe, deterministic filename. Never trusts client input.
export const buildPayslipFilename = ({ payroll, employee }) => {
  const mm = String(payroll.month).padStart(2, "0");
  const rawCode = employee?.employee_code || `EMP${employee?.employee_id ?? payroll.user_id}`;
  const code = String(rawCode).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) || `EMP${payroll.user_id}`;
  return `WorkZen-Payslip-${payroll.year}-${mm}-${code}.pdf`;
};

const sectionTitle = (doc, text, y) => {
  doc.fillColor(ACCENT).fontSize(11).font("Helvetica-Bold").text(text, doc.page.margins.left, y);
  const lineY = y + 16;
  doc.moveTo(doc.page.margins.left, lineY)
    .lineTo(doc.page.width - doc.page.margins.right, lineY)
    .lineWidth(1).strokeColor(LINE).stroke();
  return lineY + 8;
};

const keyValueRow = (doc, label, value, x, y, width) => {
  doc.fillColor(MUTED).fontSize(9).font("Helvetica").text(label, x, y, { width });
  doc.fillColor(DARK).fontSize(10).font("Helvetica-Bold").text(value ?? "-", x, y + 12, { width });
};

const componentTable = (doc, rows, x, y, width) => {
  const labelW = width * 0.62;
  let cursorY = y;
  // Header
  doc.fillColor(MUTED).fontSize(8.5).font("Helvetica-Bold");
  doc.text("COMPONENT", x, cursorY, { width: labelW });
  doc.text("AMOUNT", x + labelW, cursorY, { width: width - labelW, align: "right" });
  cursorY += 16;
  doc.moveTo(x, cursorY - 4).lineTo(x + width, cursorY - 4).lineWidth(0.5).strokeColor(LINE).stroke();

  if (rows.length === 0) {
    doc.fillColor(MUTED).fontSize(9).font("Helvetica-Oblique").text("None", x, cursorY, { width });
    cursorY += 18;
  } else {
    rows.forEach((r) => {
      doc.fillColor(DARK).fontSize(9.5).font("Helvetica")
        .text(r.component_name, x, cursorY, { width: labelW });
      doc.font("Helvetica-Bold")
        .text(money(r.amount), x + labelW, cursorY, { width: width - labelW, align: "right" });
      cursorY += 18;
    });
  }
  return cursorY;
};

export const renderPayslipPdf = async (payslip) => {
  const { payroll, employee, details } = payslip;

  const earnings = details.filter((d) => d.component_type === "Earning");
  const deductions = details.filter((d) => d.component_type === "Deduction");

  // Payable days are derived from the STORED snapshot fields (present + leave,
  // capped at working days) for display only. This is not a salary recalculation.
  const workingDays = Number(payroll.working_days || 0);
  const presentDays = Number(payroll.present_days || 0);
  const leaveDays = Number(payroll.leave_days || 0);
  const payableDays = Math.min(presentDays + leaveDays, workingDays);

  const doc = new PDFDocument({ size: "A4", margin: 48, bufferPages: false });
  const chunks = [];
  doc.on("data", (c) => chunks.push(c));
  const finished = new Promise((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const contentWidth = right - left;

  // ---- Header ----
  doc.rect(0, 0, doc.page.width, 92).fill("#f5f3ff");
  doc.fillColor(ACCENT).fontSize(22).font("Helvetica-Bold").text("WORKZEN", left, 26);
  doc.fillColor(MUTED).fontSize(10).font("Helvetica").text("Human Resource Management System", left, 54);
  doc.fillColor(DARK).fontSize(13).font("Helvetica-Bold").text("PAYSLIP", left, 70);
  doc.fillColor(MUTED).fontSize(9).font("Helvetica")
    .text(`${monthLabel(payroll.month)} ${payroll.year}`, right - 160, 70, { width: 160, align: "right" });

  let y = 112;

  // ---- Employee Information ----
  y = sectionTitle(doc, "Employee Information", y);
  const colW = contentWidth / 4;
  keyValueRow(doc, "EMPLOYEE NAME", employee?.name || "-", left, y, colW - 8);
  keyValueRow(doc, "EMPLOYEE ID", employee?.employee_code || `#${employee?.employee_id ?? payroll.user_id}`, left + colW, y, colW - 8);
  keyValueRow(doc, "DEPARTMENT", employee?.department || "-", left + colW * 2, y, colW - 8);
  keyValueRow(doc, "DESIGNATION", employee?.designation || "-", left + colW * 3, y, colW - 8);
  y += 44;

  // ---- Pay Period & Attendance ----
  y = sectionTitle(doc, "Pay Period & Attendance", y);
  const attCol = contentWidth / 6;
  keyValueRow(doc, "MONTH / YEAR", `${monthLabel(payroll.month)} ${payroll.year}`, left, y, attCol * 2 - 8);
  keyValueRow(doc, "WORKING DAYS", days(workingDays), left + attCol * 2, y, attCol - 8);
  keyValueRow(doc, "PRESENT DAYS", days(presentDays), left + attCol * 3, y, attCol - 8);
  keyValueRow(doc, "LEAVE DAYS", days(leaveDays), left + attCol * 4, y, attCol - 8);
  keyValueRow(doc, "PAYABLE DAYS", days(payableDays), left + attCol * 5, y, attCol - 8);
  y += 44;

  // ---- Earnings & Deductions (two columns) ----
  const earningsY = sectionTitle(doc, "Earnings", y);
  const halfW = contentWidth / 2 - 12;
  // Deductions title on the right column at the same height.
  doc.fillColor(ACCENT).fontSize(11).font("Helvetica-Bold")
    .text("Deductions", left + halfW + 24, y);
  doc.moveTo(left + halfW + 24, y + 16).lineTo(right, y + 16).lineWidth(1).strokeColor(LINE).stroke();

  const afterEarnings = componentTable(doc, earnings, left, earningsY, halfW);
  const afterDeductions = componentTable(doc, deductions, left + halfW + 24, earningsY, halfW);
  y = Math.max(afterEarnings, afterDeductions) + 8;

  // ---- Totals ----
  const boxTop = y;
  doc.roundedRect(left, boxTop, contentWidth, 78, 6).lineWidth(1).strokeColor(LINE).fill("#fafafa");
  const rowX = left + 16;
  const rowW = contentWidth - 32;
  let ry = boxTop + 12;
  const totalRow = (label, value, bold, color) => {
    doc.fillColor(color || DARK).fontSize(bold ? 12 : 10).font(bold ? "Helvetica-Bold" : "Helvetica")
      .text(label, rowX, ry, { width: rowW * 0.6 });
    doc.text(money(value), rowX + rowW * 0.6, ry, { width: rowW * 0.4, align: "right" });
    ry += bold ? 24 : 20;
  };
  totalRow("Gross Salary", payroll.gross_salary, false);
  totalRow("Total Deductions", payroll.total_deductions, false);
  doc.moveTo(rowX, ry - 4).lineTo(rowX + rowW, ry - 4).lineWidth(0.75).strokeColor(LINE).stroke();
  ry += 2;
  totalRow("NET SALARY", payroll.net_salary, true, ACCENT);
  y = boxTop + 78 + 16;

  // ---- Payment status ----
  y = sectionTitle(doc, "Payment", y);
  keyValueRow(doc, "PAYMENT STATUS", payroll.payment_status || "-", left, y, colW - 8);
  keyValueRow(
    doc,
    "PAYMENT DATE",
    formatDate(payroll.payment_date) || "Not yet paid",
    left + colW,
    y,
    colW * 1.5,
  );
  y += 44;

  // ---- Footer ----
  doc.fillColor(MUTED).fontSize(8).font("Helvetica-Oblique")
    .text(
      "This is a computer-generated payslip produced from the historical payroll snapshot and does not require a signature.",
      left,
      doc.page.height - doc.page.margins.bottom - 10,
      { width: contentWidth, align: "center" },
    );

  doc.end();
  return finished;
};
