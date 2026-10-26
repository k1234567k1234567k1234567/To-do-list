import { NextResponse } from 'next/server';
import { isAuthed } from '@/lib/auth';
import { getStore } from '@/lib/db';
import { summarize } from '@/lib/summarize';

export async function GET() {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json(await getStore().list());
}

export async function POST(req: Request) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { text, texts, clientDate } = await req.json();
  // Resolve relative dates against the user's clock, not the server's.
  const now = /^\d{4}-\d{2}-\d{2}$/.test(clientDate ?? '') ? new Date(`${clientDate}T12:00:00`) : new Date();
  const store = getStore();

  // Several lines at once (pasted calendar): summarize in parallel, then save in order.
  if (Array.isArray(texts)) {
    const lines = texts.filter((t): t is string => typeof t === 'string' && !!t.trim()).slice(0, 8);
    if (!lines.length) return NextResponse.json({ error: 'texts required' }, { status: 400 });
    const summaries = await Promise.all(lines.map((l) => summarize(l, now)));
    const created = [];
    for (let i = 0; i < lines.length; i++) {
      const s = summaries[i];
      created.push(await store.create({ title: s.title, type: s.type, course: s.course, due: s.due, details: lines[i].trim() }));
    }
    return NextResponse.json(created, { status: 201 });
  }

  if (typeof text !== 'string' || !text.trim()) return NextResponse.json({ error: 'text required' }, { status: 400 });
  const s = await summarize(text, now);
  const task = await store.create({ title: s.title, type: s.type, course: s.course, due: s.due, details: text.trim() });
  return NextResponse.json(task, { status: 201 });
}
