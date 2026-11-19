import {
  attendanceConfig,
  calculateAttendanceMetrics,
  formatAttendanceDateTime,
} from "../../config/attendance.js";
import {
  attendancePayableDays,
  calculatePayroll,
  countWeekdaysInclusive,
  countWorkingDays,
  paidLeaveDaysForPeriod,
} from "../../services/payrollService.js";

// =====================================================
// Deterministic planning primitives (no database access)
// =====================================================

// Small, fast, seedable PRNG so a rerun with the same seed reproduces exactly
// the same identities, leave windows and attendance timestamps.
export const createRandom = (seed) => {
  let state = Number(seed) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export const randInt = (rng, min, max) =>
  min + Math.floor(rng() * (max - min + 1));

export const weightedPick = (rng, entries) => {
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = rng() * total;
  for (const [value, weight] of entries) {
    roll -= weight;
    if (roll < 0) return value;
  }
  return entries[entries.length - 1][0];
};

const pad2 = (n) => String(n).padStart(2, "0");
const pad4 = (n) => String(n).padStart(4, "0");

export const isoDate = (utc) =>
  `${utc.getUTCFullYear()}-${pad2(utc.getUTCMonth() + 1)}-${pad2(utc.getUTCDate())}`;

const fromIso = (iso) => new Date(`${iso}T00:00:00Z`);

// Monday-Friday dates of a calendar month, ascending.
export const weekdaysInMonth = (year, month) => {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const dates = [];
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(Date.UTC(year, month - 1, day));
    const dow = date.getUTCDay();
    if (dow !== 0 && dow !== 6) dates.push(isoDate(date));
  }
  return { dates, total: daysInMonth };
};

export const coveredMonths = ({ endYear, endMonth, months }) => {
  const list = [];
  let year = endYear;
  let month = endMonth;
  for (let i = 0; i < months; i += 1) {
    list.unshift({ year, month });
    month -= 1;
    if (month < 1) {
      month = 12;
      year -= 1;
    }
  }
  return list;
};

// Ascending weekday list for a set of {year, month} periods.
export const weekdaysForMonths = (months) =>
  months.flatMap(({ year, month }) => weekdaysInMonth(year, month).dates);

export const monthRangeLabel = (months) => {
  const first = months[0];
  const last = months[months.length - 1];
  return `${first.year}-${pad2(first.month)}..${last.year}-${pad2(last.month)}`;
};

// =====================================================
// Synthetic identities
// =====================================================

const FIRST_NAMES_MALE = [
  "Aarav", "Aditya", "Akash", "Anil", "Arjun", "Bala", "Chirag", "Deepak",
  "Ganesh", "Harish", "Imran", "Jagan", "Karthik", "Lokesh", "Manoj", "Naveen",
  "Omkar", "Prakash", "Rahul", "Sandeep", "Suresh", "Vignesh", "Yogesh",
];
const FIRST_NAMES_FEMALE = [
  "Ananya", "Bhavana", "Chitra", "Deepa", "Divya", "Fatima", "Gayatri", "Ishita",
  "Jyothi", "Kavya", "Lakshmi", "Meena", "Nisha", "Pooja", "Radhika", "Sneha",
  "Swathi", "Trisha", "Usha", "Vandana", "Yamuna",
];
const LAST_NAMES = [
  "Reddy", "Rao", "Iyer", "Nair", "Menon", "Sharma", "Verma", "Gupta", "Patel",
  "Shah", "Mehta", "Kulkarni", "Desai", "Joshi", "Pillai", "Raman", "Krishnan",
  "Banerjee", "Chatterjee", "Dutta", "Kaur", "Singh", "Yadav", "Mishra",
];
const DEPARTMENTS = [
  "Engineering", "Quality Assurance", "Human Resources", "Finance", "Sales",
  "Customer Success", "Operations", "Design", "Data Platform", "Security",
];
const DESIGNATIONS = [
  "Associate Engineer", "Software Engineer", "Senior Software Engineer",
  "Lead Engineer", "Analyst", "Senior Analyst", "Consultant", "Executive",
  "Manager", "Specialist",
];
const CITIES = [
  ["Hyderabad", "Telangana"], ["Bengaluru", "Karnataka"], ["Pune", "Maharashtra"],
  ["Chennai", "Tamil Nadu"], ["Mumbai", "Maharashtra"], ["Kolkata", "West Bengal"],
  ["Ahmedabad", "Gujarat"], ["Jaipur", "Rajasthan"], ["Kochi", "Kerala"],
  ["Remote", "India"],
];

export const syntheticEmail = (index) => `emp${pad4(index)}@workzen.test`;
export const syntheticCode = (index) => `WZ-SYN-${pad4(index)}`;

const minutesToClock = (minutes) =>
  `${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`;

// Index-derived identity. Nothing here is a real person: names, phone numbers and
// addresses are synthetic and the domain is reserved for benchmark data.
export const buildIdentity = (index, rng, { referenceDate, firstCoveredDate }) => {
  const gender = rng() < 0.5 ? "Male" : "Female";
  const firstName =
    gender === "Male"
      ? FIRST_NAMES_MALE[index % FIRST_NAMES_MALE.length]
      : FIRST_NAMES_FEMALE[index % FIRST_NAMES_FEMALE.length];
  const lastName = LAST_NAMES[(index * 7) % LAST_NAMES.length];
  const department = DEPARTMENTS[(index * 3) % DEPARTMENTS.length];
  const designation = DESIGNATIONS[(index * 5) % DESIGNATIONS.length];
  const [city, state] = CITIES[(index * 11) % CITIES.length];

  const age = randInt(rng, 23, 52);
  const reference = fromIso(referenceDate);
  const dob = new Date(
    Date.UTC(
      reference.getUTCFullYear() - age,
      randInt(rng, 0, 11),
      randInt(rng, 1, 28),
    ),
  );

  // Joining always precedes the first payroll period so salary structures and
  // leave balances resolve for every generated month.
  const firstCovered = fromIso(firstCoveredDate);
  const yearsBefore = randInt(rng, 1, 6);
  const joining = new Date(
    Date.UTC(
      firstCovered.getUTCFullYear() - yearsBefore,
      randInt(rng, 0, 11),
      randInt(rng, 1, 28),
    ),
  );

  return {
    email: syntheticEmail(index),
    employee_code: syntheticCode(index),
    first_name: firstName,
    last_name: lastName,
    phone: `+91-9${pad4(8000 + (index % 1000))}${pad4((index * 37) % 10000)}`,
    date_of_birth: isoDate(dob),
    gender,
    address: `Synthetic Address ${100 + (index % 900)}, ${city}`,
    city,
    state,
    country: "India",
    postal_code: String(500000 + (index % 60000)),
    emergency_contact_name: `${FIRST_NAMES_FEMALE[(index * 13) % FIRST_NAMES_FEMALE.length]} ${lastName}`,
    emergency_contact_phone: `+91-9${pad4(7000 + (index % 1000))}${pad4((index * 53) % 10000)}`,
    date_of_joining: isoDate(joining),
    department,
    designation,
  };
};

// =====================================================
// Leave planning
// =====================================================

const LEAVE_REASONS = [
  "Personal work at home",
  "Medical appointment",
  "Family function",
  "Household maintenance",
  "Travel to home town",
  "Personal health recovery",
  "Documentation work",
  "Family health support",
];

export const statusWeights = Object.freeze([
  ["Approved", 70],
  ["Pending", 12],
  ["Rejected", 10],
  ["Cancelled", 8],
]);

// weekday-run based leave windows: only Monday-Friday dates are counted, a window
// never spans a calendar year (leaveRules.requiresSingleCalendarYear) and per
// (type, year) usage never exceeds the allocated days. countWeekdaysInclusive is
// the payroll engine's own weekday counter, which keeps leave totals identical to
// what calculateLeaveDays() would return without pulling in DB-backed imports.
export const planLeaveApplications = ({
  rng,
  dates,
  leaveTypes,
  targetCount,
  maxRunWeekdays = 4,
}) => {
  if (dates.length === 0 || targetCount <= 0) return [];

  const typeByName = new Map(leaveTypes.map((t) => [t.leave_type_name, t]));
  const typeById = new Map(leaveTypes.map((t) => [t.leave_type_id, t]));
  const allocationFor = (typeId) =>
    Number(typeById.get(typeId)?.default_days_per_year) || 0;
  const preferred = [
    ["Casual Leave", 32],
    ["Sick Leave", 30],
    ["Earned Leave", 24],
    ["Paternity Leave", 6],
    ["Unpaid Leave", 6],
    ["Maternity Leave", 2],
  ].filter(([name]) => typeByName.has(name));

  const used = new Map();
  const occupied = new Set();
  const applications = [];
  const yearOf = (index) => Number(dates[index].slice(0, 4));

  const tryAdd = (startIndex, run) => {
    if (applications.length >= targetCount || startIndex >= dates.length) return false;
    const year = yearOf(startIndex);
    let endIndex = startIndex;
    while (
      endIndex + 1 < startIndex + run &&
      endIndex + 1 < dates.length &&
      yearOf(endIndex + 1) === year
    ) {
      endIndex += 1;
    }
    for (let index = startIndex; index <= endIndex; index += 1) {
      if (occupied.has(index)) return false;
    }

    const totalDays = countWeekdaysInclusive(dates[startIndex], dates[endIndex]);
    if (totalDays <= 0) return false;

    const eligible = preferred.filter(([name]) => {
      const type = typeByName.get(name);
      if (!type.is_paid) return true;
      return (
        (used.get(`${type.leave_type_id}:${year}`) || 0) + totalDays <=
        allocationFor(type.leave_type_id)
      );
    });
    if (eligible.length === 0) return false;

    const type = typeByName.get(weightedPick(rng, eligible));
    if (type.is_paid) {
      const key = `${type.leave_type_id}:${year}`;
      used.set(key, (used.get(key) || 0) + totalDays);
    }
    for (let index = startIndex; index <= endIndex; index += 1) occupied.add(index);

    applications.push({
      leave_type_id: type.leave_type_id,
      leave_type_name: type.leave_type_name,
      is_paid: Boolean(type.is_paid),
      start_date: dates[startIndex],
      end_date: dates[endIndex],
      total_days: totalDays,
      status: weightedPick(rng, statusWeights),
      reason: LEAVE_REASONS[(startIndex + applications.length) % LEAVE_REASONS.length],
      year,
    });
    return true;
  };

  // Pass 1 spreads applications across the calendar with realistic gaps.
  let cursor = randInt(rng, 2, 12);
  while (applications.length < targetCount && cursor < dates.length) {
    const run = randInt(rng, 1, maxRunWeekdays);
    const added = tryAdd(cursor, run);
    cursor += (added ? run : 1) + randInt(rng, 8, 22);
  }

  // Pass 2 backfills shortfalls so the requested volume is met exactly whenever
  // the calendar and remaining balances allow it.
  const fillAttempts = targetCount * 40;
  for (let i = 0; applications.length < targetCount && i < fillAttempts; i += 1) {
    tryAdd(randInt(rng, 0, dates.length - 1), randInt(rng, 1, 2));
  }

  return applications.sort((a, b) => (a.start_date < b.start_date ? -1 : 1));
};

// Approved leave consumes the working day, so those weekdays are marked
// "On Leave" instead of being counted as attendance. Rejected, Pending and
// Cancelled applications do not change attendance.
export const approvedLeaveWeekdays = (applications) => {
  const dates = new Set();
  for (const app of applications) {
    if (app.status !== "Approved") continue;
    for (
      const d = fromIso(app.start_date);
      d <= fromIso(app.end_date);
      d.setUTCDate(d.getUTCDate() + 1)
    ) {
      const dow = d.getUTCDay();
      if (dow !== 0 && dow !== 6) dates.add(isoDate(d));
    }
  }
  return dates;
};

// =====================================================
// Attendance planning
// =====================================================

const attendanceMix = Object.freeze([
  ["present", 70],
  ["late", 12],
  ["early", 10],
  ["half-day", 6],
  ["absent", 2],
]);

// Every attendance row's status and minute columns come from the application's
// own calculateAttendanceMetrics(), so the dataset obeys the configured grace,
// half-day and working-hour rules exactly like a live check-in would.
export const planAttendance = ({ rng, dates, onLeaveDates = new Set() }) => {
  const rows = [];
  for (const date of dates) {
    if (onLeaveDates.has(date)) {
      rows.push({
        attendance_date: date,
        check_in_time: null,
        check_out_time: null,
        total_hours: null,
        worked_minutes: null,
        late_minutes: 0,
        early_checkout_minutes: 0,
        status: "On Leave",
        remarks: "Approved leave",
      });
      continue;
    }

    const kind = weightedPick(rng, attendanceMix);
    if (kind === "absent") {
      rows.push({
        attendance_date: date,
        check_in_time: null,
        check_out_time: null,
        total_hours: null,
        worked_minutes: null,
        late_minutes: 0,
        early_checkout_minutes: 0,
        status: "Absent",
        remarks: null,
      });
      continue;
    }

    const startLimit =
      attendanceConfig.expectedStartMinutes + attendanceConfig.lateGraceMinutes;
    let checkInMinutes;
    let checkOutMinutes;
    if (kind === "late") {
      checkInMinutes = randInt(rng, startLimit + 1, startLimit + 60);
      checkOutMinutes = randInt(
        rng,
        attendanceConfig.expectedEndMinutes,
        attendanceConfig.expectedEndMinutes + 90,
      );
    } else if (kind === "half-day") {
      checkInMinutes = randInt(rng, startLimit - 35, startLimit);
      checkOutMinutes =
        checkInMinutes +
        randInt(rng, 120, attendanceConfig.halfDayThresholdMinutes - 5);
    } else if (kind === "early") {
      checkInMinutes = randInt(rng, startLimit - 35, startLimit);
      checkOutMinutes = randInt(
        rng,
        attendanceConfig.expectedEndMinutes - 60,
        attendanceConfig.expectedEndMinutes - 1,
      );
    } else {
      checkInMinutes = randInt(rng, startLimit - 35, startLimit);
      checkOutMinutes = randInt(
        rng,
        attendanceConfig.expectedEndMinutes,
        attendanceConfig.expectedEndMinutes + 90,
      );
    }

    const checkInTime = formatAttendanceDateTime(date, minutesToClock(checkInMinutes));
    const checkOutTime = formatAttendanceDateTime(date, minutesToClock(checkOutMinutes));
    const metrics = calculateAttendanceMetrics({
      attendanceDate: date,
      checkInTime,
      checkOutTime,
    });

    rows.push({
      attendance_date: date,
      check_in_time: checkInTime,
      check_out_time: checkOutTime,
      total_hours: metrics.totalHours,
      worked_minutes: metrics.workedMinutes,
      late_minutes: metrics.lateMinutes,
      early_checkout_minutes: metrics.earlyCheckoutMinutes,
      status: metrics.status,
      remarks: null,
    });
  }
  return rows;
};

// =====================================================
// Salary structure planning
// =====================================================

// Basic Salary is a FIXED earning, HRA is a PERCENTAGE of the prorated fixed
// earnings, and PF is a FIXED deduction. That combination exercises both
// calculation_type branches while keeping net salary positive for every payable
// ratio the attendance planner can produce.
export const planSalaryComponents = ({
  rng,
  componentsByName,
  basicComponentId,
  hraComponentId,
  pfComponentId,
}) => {
  const monthlyBasic = randInt(rng, 6, 18) * 5000; // 30,000 - 90,000
  const hraPercentage = randInt(rng, 30, 45);
  return [
    {
      component_id: basicComponentId,
      component_name: "Basic Salary",
      component_type: "Earning",
      calculation_type: "FIXED",
      amount: monthlyBasic,
    },
    {
      component_id: hraComponentId,
      component_name: "House Rent Allowance",
      component_type: "Earning",
      calculation_type: "PERCENTAGE",
      amount: hraPercentage,
    },
    {
      component_id: pfComponentId,
      component_name: "Provident Fund",
      component_type: "Deduction",
      calculation_type: "FIXED",
      amount: Math.round(monthlyBasic * 0.12),
    },
  ].map((component) => ({
    ...component,
    is_taxable: componentsByName
      ? Boolean(componentsByName.get(component.component_name)?.is_taxable)
      : false,
  }));
};

// One employee's complete, self-consistent dataset: identity -> leave
// applications -> attendance (approved leave shown as "On Leave") -> payroll
// snapshots recomputed with the live payroll engine.
export const planEmployee = ({
  index,
  rng,
  leaveTypes,
  components,
  months,
  leaveTarget,
}) => {
  const dates = weekdaysForMonths(months);
  if (dates.length === 0) {
    throw new Error("Benchmark period produced no working days");
  }
  const last = months[months.length - 1];
  const referenceDate = `${last.year}-${pad2(last.month)}-${pad2(
    new Date(Date.UTC(last.year, last.month, 0)).getUTCDate(),
  )}`;

  const identity = buildIdentity(index, rng, {
    referenceDate,
    firstCoveredDate: dates[0],
  });
  const applications = planLeaveApplications({
    rng,
    dates,
    leaveTypes,
    targetCount: leaveTarget,
  });
  const attendanceRows = planAttendance({
    rng,
    dates,
    onLeaveDates: approvedLeaveWeekdays(applications),
  });

  const payroll = months.map(({ year, month }) => {
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const periodStart = `${year}-${pad2(month)}-01`;
    const periodEnd = `${year}-${pad2(month)}-${pad2(lastDay)}`;
    const workingDays = countWorkingDays(year, month);

    const periodAttendance = attendanceRows
      .filter((row) => row.attendance_date >= periodStart && row.attendance_date <= periodEnd)
      .map((row) => ({ attendance_date: row.attendance_date, status: row.status }));
    const periodLeaves = applications
      .filter(
        (app) =>
          app.status === "Approved" &&
          app.start_date <= periodEnd &&
          app.end_date >= periodStart,
      )
      .map((app) => ({
        start_date: app.start_date,
        end_date: app.end_date,
        is_paid: app.is_paid,
      }));

    const presentDays = attendancePayableDays(periodAttendance);
    const leaveDays = paidLeaveDaysForPeriod(periodLeaves, periodStart, periodEnd);
    const result = calculatePayroll({ workingDays, presentDays, leaveDays, components });

    return {
      year,
      month,
      periodStart,
      periodEnd,
      asOfDate: periodStart,
      workingDays,
      presentDays,
      leaveDays,
      attendanceCount: periodAttendance.length,
      result,
    };
  });

  return { identity, months, dates, applications, attendanceRows, payroll };
};

export const workingDaysFor = countWorkingDays;
