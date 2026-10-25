import * as chrono from 'chrono-node';
import { toISODate } from './dates';
import { TASK_TYPES, type TaskType } from './types';

const TYPE_KEYWORDS: [TaskType, RegExp][] = [
  ['exam', /\b(exams?|finals?|midterms?)\b/i],
  ['test', /\btests?\b/i],
  ['quiz', /\b(quiz(zes)?)\b/i],
  ['project', /\b(projects?|presentation|lab report|paper|essay)\b/i],
  ['study', /\b(study|review|revise|prepare|practice)\b/i],
  ['reading', /\b(read|reading|chapter)s?\b/i],
  ['assignment', /\b(assignments?|homework|hw|worksheet|problem set|pset|due)\b/i],
];

export function detectType(text: string): TaskType {
  for (const [type, re] of TYPE_KEYWORDS) if (re.test(text)) return type;
  return 'other';
}

const COURSES: [string, RegExp][] = [
  ['Bio', /\b(bio|biology|anatomy)\b/i],
  ['Chem', /\b(chem|chemistry)\b/i],
  ['Physics', /\bphysics\b/i],
  ['Math', /\b(math|algebra|calculus|calc|geometry|trig|trigonometry|statistics|stats)\b/i],
  ['History', /\b(history|apush|civics)\b/i],
  ['English', /\b(english|literature|lit|hamlet|novel|poetry|grammar)\b/i],
  ['Spanish', /\bspanish\b/i],
  ['French', /\bfrench\b/i],
  ['CS', /\b(cs|computer science|programming|coding)\b/i],
  ['Econ', /\becon(omics)?\b/i],
  ['Psych', /\bpsych(ology)?\b/i],
  ['Art', /\b(art|drawing|painting)\b/i],
];

/** Guess the class from keywords; null when nothing matches. */
export function detectCourse(text: string): string | null {
  for (const [name, re] of COURSES) if (re.test(text)) return name;
  return null;
}

/** Clean a class label typed by a user or returned by a model. */
export function cleanCourse(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const c = v.trim().replace(/\s+/g, ' ').slice(0, 30);
  return !c || /^(null|none|n\/a|unknown)$/i.test(c) ? null : c;
}

export function detectDate(text: string, now: Date = new Date()): string | null {
  const results = chrono.parse(text, now, { forwardDate: true });
  if (!results.length) return null;
  return toISODate(results[0].start.date());
}

export function shortTitle(text: string, max = 80): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  const first = clean.split(/(?<=[.!?])\s+/)[0] || clean;
  if (first.length <= max) return first.replace(/[.!?]+$/, '');
  return first.slice(0, max - 1).replace(/\s+\S*$/, '') + '…';
}

export interface Summary {
  title: string;
  type: TaskType;
  course: string | null;
  due: string | null;
}

/** Rule-based fallback used when no Grok key is configured or the call fails. */
export function summarizeLocal(text: string, now: Date = new Date()): Summary {
  return { title: shortTitle(text), type: detectType(text), course: detectCourse(text), due: detectDate(text, now) };
}

export function isTaskType(v: unknown): v is TaskType {
  return typeof v === 'string' && (TASK_TYPES as readonly string[]).includes(v);
}
