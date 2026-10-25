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
  const { text, clientDate } = await req.json();
  if (typeof text !== 'string' || !text.trim()) return NextResponse.json({ error: 'text required' }, { status: 400 });
  // Resolve relative dates against the user's clock, not the server's.
  const now = /^\d{4}-\d{2}-\d{2}$/.test(clientDate ?? '') ? new Date(`${clientDate}T12:00:00`) : new Date();
  const s = await summarize(text, now);
  const task = await getStore().create({ title: s.title, type: s.type, due: s.due, details: text.trim() });
  return NextResponse.json(task, { status: 201 });
}
