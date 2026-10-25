/** Grade math. Pure functions only; weights always come from the user (or their syllabus), never from guesses. */

export interface Part {
  id: string;
  name: string;
  weight: number | null; // percent of the final grade; null until the user sets it
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

export function weightTotal(parts: Part[]): number {
  return parts.filter(hasWeight).reduce((a, p) => a + p.weight, 0);
}

/** Weighted average over the parts that have a score. Null when nothing is graded yet. */
export function currentGrade(parts: Part[]): number | null {
  let earned = 0;
  let weight = 0;
  for (const p of parts) {
    const g = partGrade(p);
    if (g === null || !hasWeight(p)) continue;
    earned += p.weight * g;
    weight += p.weight;
  }
  return weight ? earned / weight : null;
}

export type Needed =
  | { status: 'none' } // nothing left to grade, or no weights set
  | { status: 'secured' } // target reached even with 0 on the rest
  | { status: 'unreachable'; score: number } // would need more than 100
  | { status: 'needed'; score: number; remaining: number; approximate: boolean };

/** Average score needed on the ungraded parts to finish at `target`. */
export function neededScore(parts: Part[], target: number): Needed {
  const weighted = parts.filter(hasWeight);
  const total = weightTotal(parts);
  const remaining = weighted.filter((p) => partGrade(p) === null).reduce((a, p) => a + p.weight, 0);
  if (!total || remaining <= 0) return { status: 'none' };
  const earned = weighted.reduce((a, p) => a + p.weight * (partGrade(p) ?? 0), 0);
  const need = (target * total - earned) / remaining;
  if (need <= 0) return { status: 'secured' };
  const score = Math.round(need * 10) / 10;
  if (need > 100) return { status: 'unreachable', score };
  return { status: 'needed', score, remaining, approximate: Math.abs(total - 100) > 0.01 };
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

/** Pull "Exams 40%" style lines out of pasted syllabus text. Used when no AI is available. */
export function parseWeights(text: string): { name: string; weight: number }[] {
  const out: { name: string; weight: number }[] = [];
  for (const raw of text.split(/\r?\n|;/)) {
    const line = raw.replace(/^[\s\-*•·\d.)]+(?=[A-Za-z(])/, '').trim();
    const lead = /^(\d+(?:\.\d+)?)\s*(?:%|percent)\s*[:\-–—]?\s*(.+)$/i.exec(line);
    const trail = /^(.+?)[\s:=\-–—(]+(\d+(?:\.\d+)?)\s*(?:%|percent)\)?\s*$/i.exec(line);
    const m = trail ? { name: trail[1], weight: Number(trail[2]) } : lead ? { name: lead[2], weight: Number(lead[1]) } : null;
    if (!m) continue;
    const name = m.name.replace(/[\s:=\-–—(]+$/, '').replace(/\s+/g, ' ').trim().slice(0, 40);
    if (name && m.weight > 0 && m.weight <= 100) out.push({ name, weight: m.weight });
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
