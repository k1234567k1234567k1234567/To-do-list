/** Grade math. Pure functions only; weights always come from the user (or their syllabus), never from guesses. */

/** A bare number is a percent. `{ e, p }` is points earned out of points possible; `label` records which merged member it belongs to. */
export type Score = number | { e: number; p: number; label?: string };

export interface Part {
  id: string;
  name: string;
  weight: number | null; // percent of the final grade for the whole category; null until the user sets it
  count?: number | null; // how many items the category will have (e.g. 4 tests); unknown when empty
  scores: Score[]; // scores logged so far; a category's grade is total earned / total possible
  members?: string[]; // names of the categories merged into this one (e.g. Tests, Quizzes)
  kind?: 'scores' | 'attendance'; // attendance starts full and loses a share per unexcused late/absence
  lates?: number;
  absences?: number;
  lateCost?: number | null; // percent of attendance lost per unexcused late
  absenceCost?: number | null; // percent of attendance lost per unexcused absence
  participation?: number | null; // optional participation score averaged into a combined attendance category
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

const rid = () => Math.random().toString(36).slice(2, 10);

export function scoreParts(s: Score): { e: number; p: number } {
  return typeof s === 'number' ? { e: s, p: 100 } : { e: s.e, p: s.p };
}

/** Read "86", "86%", "43/50" or "8.5 / 10". Percent-style input comes back as { e, p: 100 }. */
export function parseScore(text: string): { e: number; p: number } | null {
  const t = text.trim();
  const frac = /^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/.exec(t);
  const pct = /^(\d+(?:\.\d+)?)\s*%?$/.exec(t);
  const e = frac ? Number(frac[1]) : pct ? Number(pct[1]) : NaN;
  const p = frac ? Number(frac[2]) : 100;
  if (!Number.isFinite(e) || !(p > 0) || e < 0 || e > p * 2) return null;
  return { e, p };
}

/** Store percents as plain numbers (older data) and everything else as points. */
export function toScore(x: { e: number; p: number }, label?: string): Score {
  return x.p === 100 && !label ? x.e : { e: x.e, p: x.p, ...(label ? { label } : {}) };
}

export function formatScore(s: Score): string {
  const { e, p } = scoreParts(s);
  const r = (n: number) => String(Math.round(n * 10) / 10);
  return typeof s === 'number' || p === 100 ? r(e) : `${r(e)}/${r(p)}`;
}

export function attendanceGrade(p: Part): number {
  const base = Math.max(0, 100 - (p.lates ?? 0) * (p.lateCost ?? 0) - (p.absences ?? 0) * (p.absenceCost ?? 0));
  return typeof p.participation === 'number' ? (base + Math.min(100, Math.max(0, p.participation))) / 2 : base;
}

export function isAttendanceName(name: string): boolean {
  return /^attendance\b/i.test(name.trim());
}

/** The category's grade: total points earned over total points possible. Attendance is graded from the start. */
export function partGrade(p: Part): number | null {
  if (p.kind === 'attendance') return attendanceGrade(p);
  if (!p.scores.length) return null;
  const t = p.scores.map(scoreParts).reduce((a, x) => ({ e: a.e + x.e, p: a.p + x.p }), { e: 0, p: 0 });
  return t.p > 0 ? (t.e / t.p) * 100 : null;
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
  if (p.kind === 'attendance') return { done: p.weight, left: 0, avg: attendanceGrade(p) };
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
  | { status: 'needed'; score: number; remaining: number; approximate: boolean; assumed: boolean; attendance: boolean };

/** Average score needed on everything not yet graded to finish at `target`. */
export function neededScore(parts: Part[], target: number): Needed {
  const total = weightTotal(parts);
  let earned = 0;
  let remaining = 0;
  let assumed = false;
  let attendance = false;
  for (const p of parts) {
    const { done, left, avg } = shares(p);
    earned += done * (avg ?? 0);
    remaining += left;
    if (hasWeight(p) && p.kind === 'attendance') attendance = true;
    else if (hasWeight(p) && p.scores.length > 0 && !(p.count && p.count > 0)) assumed = true;
  }
  if (!total || remaining <= 0.0001) return { status: 'none' };
  const need = (target * total - earned) / remaining;
  if (need <= 0) return { status: 'secured' };
  const score = Math.round(need * 10) / 10;
  if (need > 100) return { status: 'unreachable', score };
  return { status: 'needed', score, remaining, approximate: Math.abs(total - 100) > 0.01, assumed, attendance };
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

const TOTAL_ROW = /^(term work|summative( work)?|course work|total|overall|final grade)$/i;

/** Pull "Exams 40%" style lines out of pasted syllabus text. Used when no AI is available. */
function parseLines(text: string): WeightRow[] {
  const out: WeightRow[] = [];
  for (const raw of text.split(/\r?\n|;/)) {
    const line = raw.replace(/^[\s\-*•·]+/, '').replace(/^\d+[.)]\s+/, '').trim();
    const lead = /^(\d+(?:\.\d+)?)\s*(?:%|percent)\s*[:\-–—]?\s*(.+)$/i.exec(line);
    const trail = /^(.+?)[\s:=\-–—(]+(\d+(?:\.\d+)?)\s*(?:%|percent)\)?\s*$/i.exec(line);
    const m = trail ? { name: trail[1], weight: Number(trail[2]) } : lead ? { name: lead[2], weight: Number(lead[1]) } : null;
    if (!m) continue;
    const cleaned = m.name.replace(/[\s:=\-–—(]+$/, '').replace(/\s+/g, ' ').trim();
    const { name, count } = extractCount(cleaned);
    const finalName = name.slice(0, 60);
    if (TOTAL_ROW.test(finalName)) continue; // a heading like "Term Work 65%" already adds up its own parts
    if (finalName && m.weight > 0 && m.weight <= 100) out.push(count && count >= 1 && count <= 50 ? { name: finalName, weight: m.weight, count } : { name: finalName, weight: m.weight });
  }
  return out;
}

export interface WeightRow { name: string; weight: number; count?: number }

/** Is there a group of two or more of `pool` adding up to `target`? Works in hundredths to avoid float noise. */
function hasGroupSum(pool: number[], target: number): boolean {
  const t = Math.round(target * 100);
  if (t <= 0 || pool.length < 2) return false;
  // dp[sum] = largest group size (capped at 2) that reaches this sum
  const dp = new Map<number, number>([[0, 0]]);
  for (const w of pool) {
    const c = Math.round(w * 100);
    if (c <= 0) continue;
    for (const [sum, n] of [...dp.entries()]) {
      const next = sum + c;
      if (next <= t) dp.set(next, Math.max(dp.get(next) ?? 0, Math.min(2, n + 1)));
    }
  }
  return (dp.get(t) ?? 0) >= 2;
}

/**
 * Outlines often list a group total ("Final Evaluations 25%") next to its items, which would count them twice.
 * When the rows add up to more than 100, drop rows that equal the sum of other rows until they fit.
 * A total line normally comes before its items, so those matches are preferred. Rows are never changed when the total is 100 or less.
 */
export function dropSubtotals(rows: WeightRow[]): { kept: WeightRow[]; dropped: WeightRow[] } {
  let kept = rows.slice(0, 30);
  const dropped: WeightRow[] = [];
  const total = (r: WeightRow[]) => r.reduce((a, x) => a + x.weight, 0);
  while (total(kept) > 100.01) {
    const order = kept.map((_, i) => i).sort((a, b) => kept[b].weight - kept[a].weight || a - b);
    const pick = (laterOnly: boolean) =>
      order.find((i) => {
        if (total(kept) - kept[i].weight < 99.99) return false; // removing it would leave too little
        const pool = kept.filter((_, j) => j !== i && (!laterOnly || j > i)).map((x) => x.weight);
        return hasGroupSum(pool, kept[i].weight);
      });
    const i = pick(true) ?? pick(false);
    if (i === undefined) break;
    dropped.push(kept[i]);
    kept = kept.filter((_, j) => j !== i);
  }
  return { kept, dropped };
}

/** Rows read from pasted syllabus text, plus any lines skipped because they only add up other lines. */
export function parseWeightsDetailed(text: string): { parts: WeightRow[]; dropped: WeightRow[] } {
  const { kept, dropped } = dropSubtotals(parseLines(text));
  return { parts: kept, dropped };
}

/** Pull "Exams 40%" style lines out of pasted syllabus text. Used when no AI is available. */
export function parseWeights(text: string): WeightRow[] {
  return parseWeightsDetailed(text).parts;
}

/** Add a score to one part, returning a new gradebook. Percents cap at 100; points keep their own scale. Unknown ids change nothing. */
export function addScore(book: GradeBook, classId: string, partId: string, score: Score, label?: string): GradeBook {
  const { e, p } = scoreParts(score);
  const clean = typeof score === 'number' ? toScore({ e: Math.min(100, Math.max(0, e)), p: 100 }, label) : toScore({ e: Math.max(0, e), p }, label ?? score.label);
  return {
    classes: book.classes.map((c) =>
      c.id !== classId ? c : { ...c, parts: c.parts.map((x) => (x.id === partId ? { ...x, scores: [...x.scores, clean] } : x)) }),
  };
}

const tag = (s: Score, label: string): Score => {
  const { e, p } = scoreParts(s);
  return { e, p, label: typeof s === 'object' && s.label ? s.label : label };
};

/** Combine two categories into one group ("Tests" + "Quizzes" = "Tests & quizzes"). Attendance cannot be merged. */
export function mergeParts(a: Part, b: Part): Part | null {
  if (a.kind === 'attendance' || b.kind === 'attendance') return null;
  const am = a.members?.length ? a.members : [a.name];
  const bm = b.members?.length ? b.members : [b.name];
  const weight = hasWeight(a) && hasWeight(b) ? a.weight + b.weight : hasWeight(a) ? a.weight : hasWeight(b) ? b.weight : null;
  const count = a.count && b.count ? a.count + b.count : null;
  const lower = b.name.charAt(0).toLowerCase() + b.name.slice(1);
  return {
    id: a.id,
    name: `${a.name} & ${lower}`,
    weight,
    count,
    members: [...am, ...bm],
    scores: [
      ...a.scores.map((s) => tag(s, am[0])),
      ...b.scores.map((s) => tag(s, bm[0])),
    ],
  };
}

/** Undo a merge: one category per member, each with its own scores. Weights are left for the user to set. */
export function splitPart(p: Part, makeId: () => string = rid): Part[] {
  const members = p.members ?? [];
  if (members.length < 2) return [p];
  return members.map((name, i) => ({
    id: i === 0 ? p.id : makeId(),
    name,
    weight: null,
    count: null,
    scores: p.scores
      .filter((s) => (typeof s === 'object' && s.label ? s.label === name : i === 0))
      .map((s) => toScore(scoreParts(s))),
  }));
}

/** Class summary line for the collapsed card, e.g. "Bio 91% (A-)". */
export function summary(c: GradeClass): string {
  const g = currentGrade(c.parts);
  return g === null ? `${c.name} –` : `${c.name} ${Math.round(g)}% (${letter(g)})`;
}

// ---------- matching a finished task to a class and category ----------

export interface TaskLike { type: string; title: string; course: string | null }
export interface Suggestion {
  classId: string | null;
  partId: string | null;
  label: string | null; // which member of a merged group (e.g. "Quizzes"), when one fits
  reason: string;
}

/** Words a task's type points to, so a "quiz" task looks for categories mentioning quizzes. */
const TYPE_WORDS: Record<string, string[]> = {
  exam: ['test', 'exam', 'midterm', 'final'],
  test: ['test', 'exam', 'midterm'],
  quiz: ['quiz'],
  assignment: ['assignment', 'homework', 'task'],
  project: ['project', 'culminating'],
};
/** Words in a title that name a category on their own. */
const TITLE_VOCAB = new Set([
  'test', 'exam', 'midterm', 'final', 'quiz', 'assignment', 'homework', 'task', 'project', 'culminating',
  'lab', 'listening', 'speaking', 'reading', 'writing', 'oral', 'presentation', 'essay',
]);

/** Words that point at one particular category count more than generic ones like "task" or "test". */
const SPECIFIC = new Set(['lab', 'listening', 'speaking', 'reading', 'writing', 'oral', 'presentation', 'essay', 'midterm', 'final', 'culminating']);

const stem = (w: string): string => {
  const x = w.toLowerCase().replace(/[^a-z]/g, '');
  if (x === 'quizzes') return 'quiz';
  if (x === 'examination' || x === 'examinations') return 'exam';
  return x.length > 3 && x.endsWith('s') ? x.slice(0, -1) : x;
};
const tokens = (text: string): string[] => text.split(/[^A-Za-z]+/).filter(Boolean).map(stem);

function scoreName(name: string, typeWords: Set<string>, titleWords: Set<string>): { score: number; word: string | null } {
  let score = 0;
  let word: string | null = null;
  for (const t of new Set(tokens(name))) {
    // A word from the title counts more than one implied by the type: "Midterm exam" prefers a Midterm category over Tests.
    const s = (titleWords.has(t) ? (SPECIFIC.has(t) ? 4 : 2) : 0) + (typeWords.has(t) ? 1 : 0);
    if (s > score) { score = s; word = t; }
    else if (s > 0) score += s;
  }
  return { score, word };
}

/** Best category in one class for a finished task, or none when unclear (never guesses between equals). */
export function suggestPart(item: TaskLike, cls: GradeClass): { partId: string; label: string | null; reason: string } | null {
  const typeWords = new Set((TYPE_WORDS[item.type] ?? []).map(stem));
  const titleWords = new Set(tokens(item.title).filter((w) => TITLE_VOCAB.has(w)));
  const rated = cls.parts
    .filter((p) => p.kind !== 'attendance')
    .map((p) => {
      const own = scoreName(p.name, typeWords, titleWords);
      const members = (p.members ?? []).map((m) => ({ m, ...scoreName(m, typeWords, titleWords) }));
      const bestM = [...members].sort((a, b) => b.score - a.score)[0];
      const tied = members.filter((x) => bestM && x.score === bestM.score).length > 1;
      const score = Math.max(own.score, bestM?.score ?? 0);
      const label = bestM && bestM.score > 0 && !tied ? bestM.m : null;
      return { p, score, label, word: (bestM && bestM.score >= own.score ? bestM.word : own.word) };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);
  if (!rated.length || (rated[1] && rated[1].score === rated[0].score)) return null;
  const top = rated[0];
  const reason = top.word && titleWords.has(top.word) ? `the title mentions "${top.word}"` : `it is a ${item.type}`;
  return { partId: top.p.id, label: top.label, reason };
}

/** Class for a finished task: its class tag, a class named in the title, or the only class. */
export function suggestClass(item: TaskLike, classes: GradeClass[]): GradeClass | null {
  const byTag = item.course ? classes.find((c) => c.name.toLowerCase() === item.course!.toLowerCase()) : undefined;
  if (byTag) return byTag;
  const words = new Set(item.title.toLowerCase().split(/[^a-z0-9]+/));
  const byTitle = classes.filter((c) => c.name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).every((w) => words.has(w)));
  if (byTitle.length === 1) return byTitle[0];
  return classes.length === 1 ? classes[0] : null;
}

export function suggestTarget(item: TaskLike, classes: GradeClass[]): Suggestion | null {
  const cls = suggestClass(item, classes);
  if (!cls) return null;
  const part = suggestPart(item, cls);
  return { classId: cls.id, partId: part?.partId ?? null, label: part?.label ?? null, reason: part?.reason ?? '' };
}

// ---------- combining rows in the setup form ----------

export interface DraftRow { id: string; name: string; weight: string; count: string; members?: string[] }

/** Setup-form version of `mergeParts`: "Tests" + "Quizzes" = "Tests & quizzes", totals added when both are set. */
export function mergeDraftRows(a: DraftRow, b: DraftRow): DraftRow | null {
  if (isAttendanceName(a.name) || isAttendanceName(b.name)) return null;
  const num = (v: string) => (v.trim() === '' ? null : Number(v));
  const aw = num(a.weight);
  const bw = num(b.weight);
  const ac = num(a.count);
  const bc = num(b.count);
  const weight = aw !== null && bw !== null ? String(Math.round((aw + bw) * 100) / 100) : aw !== null ? a.weight : b.weight;
  const count = ac !== null && bc !== null ? String(ac + bc) : '';
  const lower = b.name.charAt(0).toLowerCase() + b.name.slice(1);
  return {
    id: a.id,
    name: `${a.name} & ${lower}`,
    weight,
    count,
    members: [...(a.members?.length ? a.members : [a.name]), ...(b.members?.length ? b.members : [b.name])],
  };
}
