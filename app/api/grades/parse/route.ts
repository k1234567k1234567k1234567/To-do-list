import { NextResponse } from 'next/server';
import { isAuthed } from '@/lib/auth';
import { parseWeights } from '@/lib/grades';
import { completeJSON } from '@/lib/llm';

/** Turn pasted syllabus text into a draft list of graded parts. Nothing is saved here. */
export async function POST(req: Request) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { text } = await req.json();
  if (typeof text !== 'string' || !text.trim()) return NextResponse.json({ error: 'Paste the grading section first.' }, { status: 400 });
  const input = text.slice(0, 8000);

  try {
    const out = await completeJSON(
      'Read a course syllabus excerpt and return JSON {"name": string or null, "parts": [{"name": string, "weight": number}]}. ' +
        'Each part is a graded category or item with an explicit percentage of the final grade. Only use percentages that appear in the text. ' +
        'Do not invent parts or guess weights. If an item has no percentage, leave it out. Output JSON only.',
      input,
      25000,
    );
    const parts = Array.isArray(out?.parts)
      ? (out.parts as { name?: unknown; weight?: unknown }[])
          .map((p) => ({ name: String(p.name ?? '').trim().slice(0, 40), weight: Number(p.weight) }))
          .filter((p) => p.name && Number.isFinite(p.weight) && p.weight > 0 && p.weight <= 100)
          .slice(0, 30)
      : [];
    if (parts.length) return NextResponse.json({ name: typeof out?.name === 'string' ? out.name.slice(0, 40) : null, parts, source: 'ai' });
  } catch (err) {
    console.error('Syllabus parse failed, using rules:', err);
  }
  const parts = parseWeights(input);
  return NextResponse.json({ name: null, parts, source: 'rules' });
}
