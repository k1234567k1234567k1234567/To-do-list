import { cleanCourse, isTaskType, summarizeLocal, type Summary } from './parse';
import { toISODate } from './dates';
import { completeJSON } from './llm';
import { TASK_TYPES, isSchoolType } from './types';

/** Summarize free-form task text with an LLM; falls back to local rules on any failure. */
export async function summarize(text: string, now: Date = new Date()): Promise<Summary> {
  const local = summarizeLocal(text, now);
  try {
    const parsed = await completeJSON(
      `Turn a task description (schoolwork or everyday life) into JSON: {"title": string (max 80 chars, imperative, include course/subject for school), ` +
        `"type": one of ${TASK_TYPES.join('|')}, "course": short class name like Bio, Math or English, only for schoolwork, otherwise null, "due": "YYYY-MM-DD" or null}. ` +
        `Today is ${now.toLocaleDateString('en-US', { weekday: 'long' })} ${toISODate(now)}. Resolve relative dates like "friday" to the next such date. Output JSON only.`,
      text.slice(0, 6000),
    );
    if (!parsed) return local;
    const type = isTaskType(parsed.type) ? parsed.type : local.type;
    return {
      title: typeof parsed.title === 'string' && parsed.title.trim() ? parsed.title.trim().slice(0, 100) : local.title,
      type,
      // Only schoolwork gets a class label.
      course: isSchoolType(type) ? (cleanCourse(parsed.course) ?? local.course) : null,
      // Models are unreliable at weekday math, so a date the parser found in the text wins.
      due: local.due ?? (/^\d{4}-\d{2}-\d{2}$/.test(String(parsed.due ?? '')) ? String(parsed.due) : null),
    };
  } catch (err) {
    console.error('LLM summarize failed, using fallback:', err);
    return local;
  }
}
