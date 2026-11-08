import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useState } from "react";
import {
  buildMonthDays,
  dayLabel,
  localToday,
  monthLabel,
} from "../utils/journal";

type CalendarProps = {
  /** `YYYY-MM-DD` of the journal currently open (or today when none is open). */
  selectedDate: string;
  /** `YYYY-MM-DD` for today; highlighted in the grid. */
  today: string;
  onSelect: (date: string) => void;
  /** Dates that already have a journal file; shown with a small dot. */
  existingDays: Set<string>;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const pad = (n: number): string => String(n).padStart(2, "0");

export function Calendar({
  selectedDate,
  today,
  onSelect,
  existingDays,
}: CalendarProps) {
  const [viewMonth, setViewMonth] = useState(today.slice(0, 7));
  const [y, m] = viewMonth.split("-").map(Number);
  const days = buildMonthDays(viewMonth);

  const shiftMonth = useCallback(
    (delta: number) => {
      const shifted = new Date(y, (m ?? 1) - 1 + delta, 1);
      setViewMonth(`${shifted.getFullYear()}-${pad(shifted.getMonth() + 1)}`);
    },
    [y, m],
  );

  const isToday = (date: string) => date === today;
  const isSelected = (date: string) => date === selectedDate;

  return (
    <div className="flex min-w-0 flex-col gap-2 p-2">
      <div className="flex items-center justify-between px-1">
        <button
          type="button"
          aria-label="Previous month"
          onClick={() => shiftMonth(-1)}
          className="rounded p-1.5 text-[var(--text-muted)] hover:bg-black/5 dark:hover:bg-white/10"
        >
          <ChevronLeft size={14} />
        </button>
        <span className="shrink-0 text-sm font-semibold">{monthLabel(viewMonth)}</span>
        <button
          type="button"
          aria-label="Next month"
          onClick={() => shiftMonth(1)}
          className="rounded p-1.5 text-[var(--text-muted)] hover:bg-black/5 dark:hover:bg-white/10"
        >
          <ChevronRight size={14} />
        </button>
      </div>

      <div className="grid grid-cols-7 text-[10px] text-[var(--text-muted)] uppercase tracking-wider px-1">
        {WEEKDAYS.map((weekday) => (
          <span key={weekday} className="text-center">
            {weekday}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0.5 px-1 pb-1">
        {days.map((day) => {
          const current = isToday(day.date);
          const selected = isSelected(day.date);
          const existing = existingDays.has(day.date);
          return (
            <button
              key={day.date}
              type="button"
              aria-label={dayLabel(day.date, today)}
              aria-pressed={selected}
              onClick={() => onSelect(day.date)}
              className={`flex h-8 w-8 flex-col items-center justify-center rounded-lg text-xs transition-colors ${
                selected
                  ? "bg-[var(--accent)] text-white"
                  : current
                    ? "bg-[var(--accent)]/20 ring-2 ring-[var(--accent)] text-[var(--text-primary)]"
                    : existing
                      ? "text-[var(--text-primary)]"
                      : "text-[var(--text-muted)]"
              }} ${!day.currentMonth ? "opacity-50" : "hover:bg-black/5 dark:hover:bg-white/10"}`}
            >
              <span className="leading-none">{day.day}</span>
              {existing && !selected && !current && (
                <span className="mt-0.5 h-1 w-1 rounded-full bg-[var(--text-muted)]" />
              )}
            </button>
          );
        })}
      </div>

      <p className="px-2 text-[10px] text-[var(--text-muted)]">
        {dayLabel(today, today)} is highlighted. Pick any day to open its journal.
      </p>
    </div>
  );
}
