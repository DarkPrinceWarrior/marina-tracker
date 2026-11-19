export const WEEKDAY_SHORT_RU = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

export const WEEKDAY_FULL_RU = [
  "Понедельник",
  "Вторник",
  "Среда",
  "Четверг",
  "Пятница",
  "Суббота",
  "Воскресенье",
];

export const MONTH_NAMES_RU = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
];

export const MONTH_SHORT_RU = [
  "янв",
  "фев",
  "мар",
  "апр",
  "май",
  "июн",
  "июл",
  "авг",
  "сен",
  "окт",
  "ноя",
  "дек",
];

const MONTH_SHORT_GENITIVE_RU = [
  "янв",
  "фев",
  "мар",
  "апр",
  "мая",
  "июн",
  "июл",
  "авг",
  "сен",
  "окт",
  "ноя",
  "дек",
];

export const MONTH_GENITIVE_RU = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
];

export function pad2(n) {
  return String(n).padStart(2, "0");
}

/**
 * Format a Date object into local YYYY-MM-DD without UTC drift.
 */
export function toISODate(date = new Date()) {
  const y = date.getFullYear();
  const m = pad2(date.getMonth() + 1);
  const d = pad2(date.getDate());
  return `${y}-${m}-${d}`;
}

/**
 * Parse YYYY-MM-DD into a local Date anchored at 12:00 to avoid DST midnight shifts.
 */
export function parseISODate(iso) {
  if (!iso || typeof iso !== "string") return new Date();
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return new Date();
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

export function todayISO() {
  return toISODate(new Date());
}

export function nowTimeHHMM() {
  const now = new Date();
  return `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
}

export function addDays(iso, delta) {
  const dt = parseISODate(iso);
  dt.setDate(dt.getDate() + delta);
  return toISODate(dt);
}

export function diffDays(fromISO, toISO) {
  const a = parseISODate(fromISO);
  const b = parseISODate(toISO);
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

export function isSameISO(a, b) {
  return Boolean(a && b && String(a).slice(0, 10) === String(b).slice(0, 10));
}

/**
 * Monday = 0 ... Sunday = 6
 */
export function getWeekdayIndex(iso) {
  const jsDay = parseISODate(iso).getDay();
  return (jsDay + 6) % 7;
}

/**
 * Returns the 7 days (Mon..Sun) for the week containing `iso`.
 */
export function getWeekDays(iso = todayISO()) {
  const today = todayISO();
  const wd = getWeekdayIndex(iso);
  const mondayISO = addDays(iso, -wd);
  return Array.from({ length: 7 }, (_, i) => {
    const dayISO = addDays(mondayISO, i);
    const dt = parseISODate(dayISO);
    return {
      iso: dayISO,
      day: dt.getDate(),
      weekdayShort: WEEKDAY_SHORT_RU[i],
      weekdayFull: WEEKDAY_FULL_RU[i],
      isToday: dayISO === today,
      isSelected: dayISO === iso,
    };
  });
}

/**
 * Returns a rolling strip around `centerISO` (e.g., 3 days before + center + 3 days after).
 */
export function getRollingDays(centerISO = todayISO(), before = 3, after = 3) {
  const today = todayISO();
  const result = [];
  for (let offset = -before; offset <= after; offset++) {
    const dayISO = addDays(centerISO, offset);
    const dt = parseISODate(dayISO);
    const wd = getWeekdayIndex(dayISO);
    result.push({
      iso: dayISO,
      day: dt.getDate(),
      weekdayShort: WEEKDAY_SHORT_RU[wd],
      weekdayFull: WEEKDAY_FULL_RU[wd],
      isToday: dayISO === today,
      isSelected: dayISO === centerISO,
    });
  }
  return result;
}

/**
 * Shifts (year, month 1..12) by `delta` months.
 */
export function shiftMonth(year, month, delta) {
  const dt = new Date(year, month - 1 + delta, 1, 12, 0, 0, 0);
  return {
    year: dt.getFullYear(),
    month: dt.getMonth() + 1,
  };
}

/**
 * Generates a list of recent months (newest first) for quick 12+ month navigation.
 */
export function getLastNMonths(count = 18, baseISO = todayISO()) {
  const base = parseISODate(baseISO);
  const startYear = base.getFullYear();
  const startMonth = base.getMonth() + 1;
  const items = [];
  for (let i = 0; i < count; i++) {
    const { year, month } = shiftMonth(startYear, startMonth, -i);
    items.push({
      year,
      month,
      key: `${year}-${pad2(month)}`,
      label: formatMonthYearRu(year, month),
      shortLabel: `${MONTH_SHORT_RU[month - 1]} ${String(year).slice(2)}`,
    });
  }
  return items;
}

/**
 * Returns a Russian calendar matrix (weeks starting Monday) for given year & 1-based month.
 * Each cell: { iso, day, year, month, inMonth, isToday, weekdayIndex }.
 */
export function getMonthMatrix(year, month) {
  const today = todayISO();
  const firstDay = new Date(year, month - 1, 1, 12, 0, 0, 0);
  const daysInMonth = new Date(year, month, 0, 12, 0, 0, 0).getDate();
  const startOffset = (firstDay.getDay() + 6) % 7; // Mon=0 .. Sun=6
  const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;

  const cells = [];
  for (let idx = 0; idx < totalCells; idx++) {
    const dt = new Date(year, month - 1, 1 - startOffset + idx, 12, 0, 0, 0);
    const iso = toISODate(dt);
    cells.push({
      iso,
      day: dt.getDate(),
      year: dt.getFullYear(),
      month: dt.getMonth() + 1,
      inMonth: dt.getFullYear() === year && dt.getMonth() + 1 === month,
      isToday: iso === today,
      weekdayIndex: idx % 7,
    });
  }

  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }
  return weeks;
}

export function formatDateRu(iso) {
  const dt = parseISODate(iso);
  return `${dt.getDate()} ${MONTH_GENITIVE_RU[dt.getMonth()]}`;
}

export function formatDateShortRu(iso) {
  const dt = parseISODate(iso);
  return `${dt.getDate()} ${MONTH_SHORT_GENITIVE_RU[dt.getMonth()]}`;
}

export function formatDateWithYearRu(iso) {
  const dt = parseISODate(iso);
  return `${dt.getDate()} ${MONTH_GENITIVE_RU[dt.getMonth()]} ${dt.getFullYear()}`;
}

export function formatDateFullRu(iso) {
  const wd = getWeekdayIndex(iso);
  return `${WEEKDAY_FULL_RU[wd]}, ${formatDateRu(iso)}`;
}

export function formatMonthYearRu(year, month) {
  return `${MONTH_NAMES_RU[month - 1]} ${year}`;
}

export function formatRelativeDayRu(iso) {
  const today = todayISO();
  const delta = diffDays(today, iso);
  if (delta === 0) return "Сегодня";
  if (delta === -1) return "Вчера";
  if (delta === 1) return "Завтра";
  return formatDateRu(iso);
}

export function formatShortRangeRu(startISO, endISO) {
  if (!startISO) return "";
  if (!endISO || startISO === endISO) return formatDateShortRu(startISO);
  const a = parseISODate(startISO);
  const b = parseISODate(endISO);
  if (a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()) {
    return `${a.getDate()}–${b.getDate()} ${MONTH_SHORT_GENITIVE_RU[a.getMonth()]}`;
  }
  return `${formatDateShortRu(startISO)} – ${formatDateShortRu(endISO)}`;
}

export function pluralizeRu(count, one, few, many) {
  const n = Math.abs(Math.trunc(count)) % 100;
  const n1 = n % 10;
  if (n > 10 && n < 20) return many;
  if (n1 > 1 && n1 < 5) return few;
  if (n1 === 1) return one;
  return many;
}

export function formatCountRu(count, one, few, many) {
  return `${count} ${pluralizeRu(count, one, few, many)}`;
}
