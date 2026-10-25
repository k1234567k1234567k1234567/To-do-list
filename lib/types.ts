export const TASK_TYPES = [
  'exam', 'test', 'quiz', 'assignment', 'project', 'study', 'reading',
  'appointment', 'bill', 'errand', 'event', 'personal', 'other',
] as const;
export type TaskType = (typeof TASK_TYPES)[number];

export const SCHOOL_TYPES: readonly TaskType[] = ['exam', 'test', 'quiz', 'assignment', 'project', 'study', 'reading'];
export const isSchoolType = (t: TaskType): boolean => SCHOOL_TYPES.includes(t);

/** Types that normally get a grade back. Anything else is completion-only unless the user flips it. */
const GRADED_BY_DEFAULT: readonly TaskType[] = ['exam', 'test', 'quiz', 'project'];
export const isGraded = (t: Pick<Task, 'type' | 'graded'>): boolean => t.graded ?? GRADED_BY_DEFAULT.includes(t.type);

export interface Task {
  id: string;
  title: string;
  details: string;
  type: TaskType;
  course?: string | null; // class label, e.g. "Bio"
  completedAt?: string | null;
  graded?: boolean; // overrides the per-type default
  due: string | null; // YYYY-MM-DD
  done: boolean;
  createdAt: string;
  remindersSent: string[]; // window keys already sent, e.g. "1d", "0d"
}

export interface Settings {
  phone: string;
  carrier: string;
  email: string;
  textReminders: boolean;
  emailReminders: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  phone: '',
  carrier: '',
  email: '',
  textReminders: true,
  emailReminders: false,
};
