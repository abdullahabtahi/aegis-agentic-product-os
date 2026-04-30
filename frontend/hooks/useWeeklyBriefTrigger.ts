import { useState } from "react";

/** Returns ISO week key e.g. "2026-W18" using pure JS (no date-fns). */
function getISOWeekKey(): string {
  const d = new Date();
  // Thursday of the current ISO week
  const thursday = new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate() - ((d.getDay() + 6) % 7) + 3,
  );
  const year = thursday.getFullYear();
  const firstThursday = new Date(year, 0, 4);
  const weekNum = Math.ceil(
    ((thursday.getTime() - firstThursday.getTime()) / 86400000 +
      firstThursday.getDay() +
      1) /
      7,
  );
  return `${year}-W${String(weekNum).padStart(2, "0")}`;
}

const STORAGE_KEY = "aegis:brief:last_opened_week";

/**
 * Returns whether the weekly brief should be shown this week.
 * Compares current ISO week against localStorage key.
 * Call `dismiss()` to suppress until next week.
 */
export function useWeeklyBriefTrigger(): {
  shouldShow: boolean;
  weekKey: string;
  dismiss: () => void;
} {
  const weekKey = getISOWeekKey();

  const [shouldShow, setShouldShow] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem(STORAGE_KEY) !== weekKey;
    } catch {
      return false;
    }
  });

  const dismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, weekKey);
    } catch {
      // ignore — storage may be blocked
    }
    setShouldShow(false);
  };

  return { shouldShow, weekKey, dismiss };
}
