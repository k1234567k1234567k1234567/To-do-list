/** Grade math. Pure functions only; weights always come from the user (or their syllabus), never from guesses. */

export interface Part {
  id: string;
  name: string;
  weight: number | null; // percent of the final grade for the whole category; null until the user sets it
  count?: number | null; // how many items the category will have (e.g. 4 tests); unknown when empty
  scores: number[]; // percent scores logged so far; several are averaged
}

export interface GradeClass {
  id: string;
  name: string;
  target: number; // grade the user is aiming for, percent
  parts: Part[];
}

export interface GradeBook {
  classes: GradeClass[];
}

export interface AwaitingItem {
  id: string; // task id
  title: string;
  course: string | null;
  type: string;
  doneAt: string;
}

const hasWeight = (p: Part): p is Part & { weight: number } => typeof p.weight === 'number' && p.weight > 0;

export function partGrade(p: Part): number | null {
  return p.scores.length ? p.scores.reduce((a, b) => a + b, 0) / p.scores.length : null;
}

/** Items the category is expected to have: the stated count, raised to the scores already logged. */
export function itemCount(p: Part): number {
  return Math.max(p.count && p.count > 0 ? Math.floor(p.count) : 0, p.scores.length);
}

/** What each item in the category is worth, when the count is known. */
export function perItem(p: Part): number | null {
  return hasWeight(p) && p.count && p.count > 0 ? p.weight / itemCount(p) : null;
}

/** Share of the final grade already graded in this category, and the share still to come. */
function shares(p: Part): { done: number; left: number; avg: number | null } {
  if (!hasWeight(p)) return { done: 0, left: 0, avg: null };
  const n = p.scores.length;
  if (n === 0) return { done: 0, left: p.weight, avg: null };
  // With no stated count the scores so far stand in for the whole category.
  const done = p.weight * (n / itemCount(p));
  return { done, left: p.weight - done, avg: partGrade(p) };
}

export function weightTotal(parts: Part[]): number {
  return parts.filter(hasWeight).reduce((a, p) => a + p.weight, 0);
}

/** Weighted average over what has been graded so far. Null when nothing is graded yet. */
export function currentGrade(parts: Part[]): number | null {
  let earned = 0;
  let weight = 0;
  for (const p of parts) {
    const { done, avg } = shares(p);
    if (avg === null || done <= 0) continue;
    earned += done * avg;
    weight += done;
  }
  return weight ? earned / weight : null;
}

export type Needed =
  | { status: 'none' } // nothing left to grade, or no weights set
  | { status: 'secured' } // target reached even with 0 on the rest
  | { status: 'unreachable'; score: number } // would need more than 100
  | { status: 'needed'; score: number; remaining: number; approximate: boolean; assumed: boolean };

/** Average score needed on everything not yet graded to finish at `target`. */
export function neededScore(parts: Part[], target: number): Needed {
  const total = weightTotal(parts);
  let earned = 0;
  let remaining = 0;
  let assumed = false;
  for (const p of parts) {
    const { done, left, avg } = shares(p);
    earned += done * (avg ?? 0);
    remaining += left;
    if (hasWeight(p) && p.scores.length > 0 && !(p.count && p.count > 0)) assumed = true;
  }
  if (!total || remaining <= 0.0001) return { status: 'none' };
  const need = (target * total - earned) / remaining;
  if (need <= 0) return { status: 'secured' };
  const score = Math.round(need * 10) / 10;
  if (need > 100) return { status: 'unreachable', score };
  return { status: 'needed', score, remaining, approximate: Math.abs(total - 100) > 0.01, assumed };
}

const BANDS: [number, string][] = [
  [97, 'A+'], [93, 'A'], [90, 'A-'], [87, 'B+'], [83, 'B'], [80, 'B-'],
  [77, 'C+'], [73, 'C'], [70, 'C-'], [67, 'D+'], [63, 'D'], [60, 'D-'],
];
export function letter(grade: number): string {
  return BANDS.find(([min]) => grade >= min)?.[1] ?? 'F';
}

/** Message when the weights do not add up to 100, else null. */
export function weightWarning(parts: Part[]): string | null {
  const total = weightTotal(parts);
  if (!parts.length || Math.abs(total - 100) < 0.01) return null;
  const t = Math.round(total * 10) / 10;
  return t < 100 ? `Weights add up to ${t}%, so ${Math.round((100 - t) * 10) / 10}% is not accounted for.` : `Weights add up to ${t}%, which is more than 100%.`;
}

const WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

/** Find "how many" in a category name: "Quizzes (4)", "4 quizzes", "best 4 of 5". */
function extractCount(raw: string): { name: string; count?: number } {
  let m = /\((\d{1,2})\)\s*$/.exec(raw);
  if (m) return { name: raw.slice(0, m.index).trim(), count: Number(m[1]) };
  m = /\bof\s+(\d{1,2})\b/i.exec(raw);
  if (m) return { name: raw, count: Number(m[1]) };
  m = /^(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)\s+([A-Za-z].*)$/i.exec(raw);
  if (m) {
    const n = /^\d/.test(m[1]) ? Number(m[1]) : WORDS[m[1].toLowerCase()];
    return { name: m[2].charAt(0).toUpperCase() + m[2].slice(1), count: n };
  }
  return { name: raw };
}

/** Pull "Exams 40%" style lines out of pasted syllabus text. Used when no AI is available. */
export function parseWeights(text: string): { name: string; weight: number; count?: number }[] {
  const out: { name: string; weight: number; count?: number }[] = [];
  for (const raw of text.split(/\r?\n|;/)) {
    const line = raw.replace(/^[\s\-*•·]+/, '').replace(/^\d+[.)]\s+/, '').trim();
    const lead = /^(\d+(?:\.\d+)?)\s*(?:%|percent)\s*[:\-–—]?\s*(.+)$/i.exec(line);
    const trail = /^(.+?)[\s:=\-–—(]+(\d+(?:\.\d+)?)\s*(?:%|percent)\)?\s*$/i.exec(line);
    const m = trail ? { name: trail[1], weight: Number(trail[2]) } : lead ? { name: lead[2], weight: Number(lead[1]) } : null;
    if (!m) continue;
    const cleaned = m.name.replace(/[\s:=\-–—(]+$/, '').replace(/\s+/g, ' ').trim();
    const { name, count } = extractCount(cleaned);
    const finalName = name.slice(0, 40);
    if (finalName && m.weight > 0 && m.weight <= 100) out.push(count && count >= 1 && count <= 50 ? { name: finalName, weight: m.weight, count } : { name: finalName, weight: m.weight });
  }
  return out;
}

/** Add a score to one part, returning a new gradebook. Unknown ids leave it unchanged. */
export function addScore(book: GradeBook, classId: string, partId: string, score: number): GradeBook {
  const s = Math.min(100, Math.max(0, score));
  return {
    classes: book.classes.map((c) =>
      c.id !== classId ? c : { ...c, parts: c.parts.map((p) => (p.id === partId ? { ...p, scores: [...p.scores, s] } : p)) }),
  };
}

/** Class summary line for the collapsed card, e.g. "Bio 91% (A-)". */
export function summary(c: GradeClass): string {
  const g = currentGrade(c.parts);
  return g === null ? `${c.name} –` : `${c.name} ${Math.round(g)}% (${letter(g)})`;
}
