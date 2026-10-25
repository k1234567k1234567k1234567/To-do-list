import { daysBetween } from './dates';
import { priorityOf } from './priority';
import type { Task } from './types';

export const FILTERS = [
  { id: 'active', label: 'All active' },
  { id: 'today', label: 'Due today' },
  { id: 'tomorrow', label: 'Due tomorrow' },
  { id: 'week', label: 'Due this week' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'high', label: 'High priority' },
  { id: 'assignments', label: 'Assignments' },
  { id: 'exams', label: 'Exams / tests / quizzes' },
  { id: 'study', label: 'Study & reading' },
  { id: 'nodate', label: 'No due date' },
  { id: 'completed', label: 'Completed' },
] as const;
export type FilterId = (typeof FILTERS)[number]['id'];

export function matchesFilter(t: Task, filter: FilterId, today: string): boolean {
  if (filter === 'completed') return t.done;
  if (t.done) return false;
  const days = t.due ? daysBetween(today, t.due) : null;
  switch (filter) {
    case 'active': return true;
    case 'today': return days === 0;
    case 'tomorrow': return days === 1;
    case 'week': return days !== null && days >= 0 && days <= 7;
    case 'overdue': return days !== null && days < 0;
    case 'high': return priorityOf(t, today) === 'high';
    case 'assignments': return t.type === 'assignment' || t.type === 'project';
    case 'exams': return t.type === 'exam' || t.type === 'test' || t.type === 'quiz';
    case 'study': return t.type === 'study' || t.type === 'reading';
    case 'nodate': return days === null;
  }
}

export function matchesSearch(t: Task, q: string): boolean {
  const s = q.trim().toLowerCase();
  return !s || t.title.toLowerCase().includes(s) || t.details.toLowerCase().includes(s) || t.type.includes(s);
}

/** Open tasks due on one specific day (used by the week strip). */
export function matchesDate(t: Task, date: string): boolean {
  return !t.done && t.due === date;
}
