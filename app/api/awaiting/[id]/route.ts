import { NextResponse } from 'next/server';
import { isAuthed } from '@/lib/auth';
import { getStore } from '@/lib/db';
import { addScore, parseScore, toScore, type AwaitingItem, type GradeBook } from '@/lib/grades';

type Ctx = { params: Promise<{ id: string }> };

/** Log the score for a finished task (`classId`, `partId`, `score`), or dismiss it (`dismiss: true`). */
export async function POST(req: Request, { params }: Ctx) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  const store = getStore();
  const awaiting = await store.getKV<AwaitingItem[]>('awaiting', []);
  if (!awaiting.some((a) => a.id === id)) return NextResponse.json({ error: 'not found' }, { status: 404 });

  if (!body.dismiss) {
    const parsed = parseScore(String(body.score ?? ''));
    if (!parsed) return NextResponse.json({ error: 'Enter a score like 86 or 43/50.' }, { status: 400 });
    const book = await store.getKV<GradeBook>('grades', { classes: [] });
    const cls = book.classes.find((c) => c.id === body.classId);
    const part = cls?.parts.find((p) => p.id === body.partId);
    if (!cls || !part) return NextResponse.json({ error: 'class or part not found' }, { status: 400 });
    // For a merged group the score remembers which member it belongs to (e.g. Quizzes).
    const label = typeof body.label === 'string' && body.label ? body.label : undefined;
    if (label && !(part.members ?? []).includes(label)) return NextResponse.json({ error: 'unknown part of that category' }, { status: 400 });
    await store.setKV('grades', addScore(book, body.classId, body.partId, toScore(parsed), label));
  }
  await store.setKV('awaiting', awaiting.filter((a) => a.id !== id));
  return NextResponse.json({ ok: true });
}
