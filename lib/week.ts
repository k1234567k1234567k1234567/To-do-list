import { addDays, toISODate } from './dates';
import { priorityOf, type Priority } from './priority';
import type { Task } from './types';

export interface WeekDay {
  date: string; // YYYY-MM-DD
  label: string; // Mon, Tue...
  day: number; // day of month
  isToday: boolean;
}

const LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Seven days starting at `today`, so "this week" always means the next seven days. */
export function weekDays(today: string): WeekDay[] {
  const [y, m, d] = today.split('-').map(Number);
  return Array.from({ length: 7 }, (_, i) => {
    const dt = new Date(y, m - 1, d + i);
    return { date: toISODate(dt), label: LABELS[dt.getDay()], day: dt.getDate(), isToday: i === 0 };
  });
}

/** Open tasks due on each day, as priorities (for colored dots). */
export function dotsByDay(tasks: Task[], days: { date: string }[], today: string): Record<string, Priority[]> {
  const out: Record<string, Priority[]> = Object.fromEntries(days.map((d) => [d.date, []]));
  for (const t of tasks) {
    if (t.done || !t.due || !(t.due in out)) continue;
    out[t.due].push(priorityOf(t, today));
  }
  return out;
}

export interface Stats {
  dueToday: number;
  overdue: number;
  doneRecently: number;
}

/** `doneRecently` counts completions in the last 7 days from the history log, so clearing completed tasks does not reset it. */
export function stats(tasks: Task[], today: string, history: History = {}): Stats {
  const open = tasks.filter((t) => !t.done && t.due);
  const week = Array.from({ length: 7 }, (_, i) => history[addDays(today, -i)] ?? 0);
  return {
    dueToday: open.filter((t) => t.due === today).length,
    overdue: open.filter((t) => t.due! < today).length,
    doneRecently: week.reduce((a, b) => a + b, 0),
  };
}

export function greeting(hour: number): string {
  return hour < 5 ? 'Up late' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
}

export type History = Record<string, number>;

/** Consecutive days with at least one completion, ending today (or yesterday if today has none yet). */
export function streak(history: History, today: string): number {
  let day = (history[today] ?? 0) > 0 ? today : addDays(today, -1);
  let n = 0;
  while ((history[day] ?? 0) > 0) { n++; day = addDays(day, -1); }
  return n;
}

/** Completions for the 7 days ending today, oldest first. */
export function lastSevenDays(history: History, today: string): { date: string; label: string; count: number }[] {
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(today, i - 6);
    const [y, m, d] = date.split('-').map(Number);
    return { date, label: LABELS[new Date(y, m - 1, d).getDay()], count: history[date] ?? 0 };
  });
}

export interface MonthCell {
  date: string;
  day: number;
  inMonth: boolean;
}

/** Sunday-first weeks covering a month; `month` is 0-based. */
export function monthGrid(year: number, month: number): MonthCell[][] {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay());
  const weeks: MonthCell[][] = [];
  for (let w = 0; w < 6; w++) {
    const row: MonthCell[] = [];
    for (let i = 0; i < 7; i++) {
      const dt = new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + i);
      row.push({ date: toISODate(dt), day: dt.getDate(), inMonth: dt.getMonth() === month });
    }
    if (w > 0 && !row.some((c) => c.inMonth)) break;
    weeks.push(row);
  }
  return weeks;
}
