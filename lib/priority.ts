import { daysBetween } from './dates';
import type { Task, TaskType } from './types';

export type Priority = 'high' | 'medium' | 'low';

const TYPE_WEIGHT: Record<TaskType, number> = {
  exam: 40,
  test: 40,
  quiz: 35,
  project: 25,
  assignment: 15,
  study: 12,
  other: 10,
  reading: 8,
};

function urgency(days: number | null): number {
  if (days === null) return 0;
  if (days < 0) return 60;
  if (days === 0) return 55;
  if (days === 1) return 45;
  if (days <= 3) return 35;
  if (days <= 7) return 22;
  if (days <= 14) return 10;
  return 0;
}

export function scoreTask(task: Pick<Task, 'type' | 'due'>, today: string): number {
  const days = task.due ? daysBetween(today, task.due) : null;
  return TYPE_WEIGHT[task.type] + urgency(days);
}

export function priorityOf(task: Pick<Task, 'type' | 'due'>, today: string): Priority {
  const s = scoreTask(task, today);
  if (s >= 70) return 'high';
  if (s >= 40) return 'medium';
  return 'low';
}
