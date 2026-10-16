/** Counts of distinct questions in the current bank/version, never grades. */
export type DashboardStats = {
  total: number | null;
  answered: number | null;
  notes: number | null;
  favorites: number | null;
};

export const unavailableStats: DashboardStats = { total: null, answered: null, notes: null, favorites: null };

export type ExamCountdown = {
  state: "unset" | "future" | "today" | "past" | "unavailable";
  days: number | null;
  dateLabel: string | null;
};

/** Calendar days in the student's timezone; never divide elapsed local hours by 24. */
export function examCountdown(examDate: string | null, timezone: string, now: Date): ExamCountdown {
  if (!examDate) return { state: "unset", days: null, dateLabel: null };
  const unavailable: ExamCountdown = { state: "unavailable", days: null, dateLabel: null };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(examDate) || !Number.isFinite(now.getTime())) return unavailable;
  const [year, month, day] = examDate.split("-").map(Number);
  const exam = new Date(Date.UTC(year, month - 1, day));
  if (year < 1900 || year > 2200 || exam.getUTCFullYear() !== year
    || exam.getUTCMonth() !== month - 1 || exam.getUTCDate() !== day) return unavailable;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(now);
    const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find(p => p.type === type)?.value);
    const today = Date.UTC(part("year"), part("month") - 1, part("day"));
    const difference = Math.round((exam.getTime() - today) / 86_400_000);
    const dateLabel = new Intl.DateTimeFormat("es-MX", {
      timeZone: "UTC", day: "numeric", month: "long", year: "numeric",
    }).format(exam);
    return { state: difference > 0 ? "future" : difference === 0 ? "today" : "past", days: Math.max(0, difference), dateLabel };
  } catch { return unavailable; }
}
