import dotenv from "dotenv";

dotenv.config();

const parseInteger = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
};

export const attendanceConfig = {
  timeZone: process.env.APP_TIMEZONE || "Asia/Kolkata",
  standardWorkingMinutes: parseInteger(
    process.env.ATTENDANCE_STANDARD_MINUTES,
    480,
  ),
  lateGraceMinutes: parseInteger(process.env.ATTENDANCE_LATE_GRACE_MINUTES, 15),
  halfDayThresholdMinutes: parseInteger(
    process.env.ATTENDANCE_HALF_DAY_THRESHOLD_MINUTES,
    240,
  ),
  expectedStartMinutes: parseInteger(
    process.env.ATTENDANCE_EXPECTED_START_MINUTES,
    540,
  ),
  expectedEndMinutes: parseInteger(
    process.env.ATTENDANCE_EXPECTED_END_MINUTES,
    1080,
  ),
};

const getTimeZoneParts = (date) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: attendanceConfig.timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  })
    .formatToParts(date)
    .reduce((values, part) => {
      if (part.type !== "literal") values[part.type] = part.value;
      return values;
    }, {});

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    datetime: `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`,
    minutesSinceMidnight:
      Number(parts.hour) * 60 + Number(parts.minute),
  };
};

export const getBusinessNow = () => getTimeZoneParts(new Date());

export const parseSqlDateTime = (value) => {
  const match = String(value).match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/,
  );

  if (!match) return null;

  const [, year, month, day, hour, minute, second = "0"] = match;
  return {
    date: `${year}-${month}-${day}`,
    minutesSinceMidnight: Number(hour) * 60 + Number(minute),
    epochMinutes: Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
    ) / 60000,
  };
};

export const calculateAttendanceMetrics = ({
  attendanceDate,
  checkInTime,
  checkOutTime,
}) => {
  const checkIn = parseSqlDateTime(checkInTime);
  const checkOut = parseSqlDateTime(checkOutTime);

  if (!checkIn || !checkOut || checkOut.epochMinutes < checkIn.epochMinutes) {
    throw new Error("Attendance timestamps are invalid");
  }

  const workedMinutes = Math.round(checkOut.epochMinutes - checkIn.epochMinutes);
  const lateMinutes = Math.max(
    0,
    checkIn.minutesSinceMidnight -
      attendanceConfig.expectedStartMinutes -
      attendanceConfig.lateGraceMinutes,
  );
  const earlyCheckoutMinutes = Math.max(
    0,
    attendanceConfig.expectedEndMinutes - checkOut.minutesSinceMidnight,
  );

  let status = "Present";
  if (workedMinutes < attendanceConfig.halfDayThresholdMinutes) {
    status = "Half-Day";
  } else if (lateMinutes > 0) {
    status = "Late";
  }

  if (checkIn.date !== attendanceDate || checkOut.date !== attendanceDate) {
    throw new Error("Attendance timestamps do not match the attendance date");
  }

  return {
    workedMinutes,
    totalHours: (workedMinutes / 60).toFixed(2),
    lateMinutes,
    earlyCheckoutMinutes,
    status,
  };
};

export const formatAttendanceDateTime = (attendanceDate, timeValue) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(attendanceDate)) {
    throw new Error("attendance_date must use YYYY-MM-DD format");
  }
  if (timeValue === null || timeValue === undefined || timeValue === "") {
    return null;
  }
  const time = String(timeValue).match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!time || Number(time[2]) > 59 || Number(time[1]) > 23) {
    throw new Error("Attendance times must use HH:mm or HH:mm:ss format");
  }
  return `${attendanceDate} ${time[1]}:${time[2]}:${time[3] || "00"}`;
};

export const calculateOpenAttendanceMetrics = ({
  attendanceDate,
  checkInTime,
}) => {
  const checkIn = parseSqlDateTime(checkInTime);
  if (!checkIn || checkIn.date !== attendanceDate) {
    throw new Error("Attendance timestamps do not match the attendance date");
  }

  const lateMinutes = Math.max(
    0,
    checkIn.minutesSinceMidnight -
      attendanceConfig.expectedStartMinutes -
      attendanceConfig.lateGraceMinutes,
  );

  return {
    workedMinutes: null,
    totalHours: null,
    lateMinutes,
    earlyCheckoutMinutes: 0,
    status: lateMinutes > 0 ? "Late" : "Present",
  };
};