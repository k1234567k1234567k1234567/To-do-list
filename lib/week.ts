import { toISODate } from './dates';
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
export function dotsByDay(tasks: Task[], days: WeekDay[], today: string): Record<string, Priority[]> {
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

export function stats(tasks: Task[], today: string): Stats {
  const open = tasks.filter((t) => !t.done && t.due);
  return {
    dueToday: open.filter((t) => t.due === today).length,
    overdue: open.filter((t) => t.due! < today).length,
    doneRecently: tasks.filter((t) => t.done).length,
  };
}

export function greeting(hour: number): string {
  return hour < 5 ? 'Up late' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
}
