export const TASK_TYPES = ['exam', 'test', 'quiz', 'assignment', 'project', 'study', 'reading', 'other'] as const;
export type TaskType = (typeof TASK_TYPES)[number];

export interface Task {
  id: string;
  title: string;
  details: string;
  type: TaskType;
  course?: string | null; // class label, e.g. "Bio"
  completedAt?: string | null;
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
