import { NextResponse } from 'next/server';
import { isAuthed } from '@/lib/auth';
import { dropSubtotals, parseWeightsDetailed } from '@/lib/grades';
import { completeJSON } from '@/lib/llm';

/** Turn pasted syllabus text into a draft list of graded parts. Nothing is saved here. */
export async function POST(req: Request) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { text } = await req.json();
  if (typeof text !== 'string' || !text.trim()) return NextResponse.json({ error: 'Paste the grading section first.' }, { status: 400 });
  const input = text.slice(0, 8000);

  try {
    const out = await completeJSON(
      'Read a course syllabus excerpt and return JSON {"name": string or null, "parts": [{"name": string, "weight": number, "count": integer or null}]}. ' +
        'Each part is a graded category or item with an explicit percentage of the final grade. Only use percentages that appear in the text. ' +
        'The count is how many items the category has when the text says so ("4 quizzes", "best 4 of 5" means 5), otherwise null. ' +
        'If a line is only the total of other listed lines (for example "Final Evaluations 25%" above its two items), leave it out and keep the individual items. ' +
        'Do not invent parts or guess weights or counts. If an item has no percentage, leave it out. Output JSON only.',
      input,
      25000,
    );
    const parts = Array.isArray(out?.parts)
      ? (out.parts as { name?: unknown; weight?: unknown; count?: unknown }[])
          .map((p) => {
            const count = Math.round(Number(p.count));
            return { name: String(p.name ?? '').trim().slice(0, 60), weight: Number(p.weight), ...(count >= 1 && count <= 50 ? { count } : {}) };
          })
          .filter((p) => p.name && Number.isFinite(p.weight) && p.weight > 0 && p.weight <= 100)
          .slice(0, 30)
      : [];
    if (parts.length) {
      const { kept, dropped } = dropSubtotals(parts);
      return NextResponse.json({ name: typeof out?.name === 'string' ? out.name.slice(0, 60) : null, parts: kept, dropped, source: 'ai' });
    }
  } catch (err) {
    console.error('Syllabus parse failed, using rules:', err);
  }
  const { parts, dropped } = parseWeightsDetailed(input);
  return NextResponse.json({ name: null, parts, dropped, source: 'rules' });
}
