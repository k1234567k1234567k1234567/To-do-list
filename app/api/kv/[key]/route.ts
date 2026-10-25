import { NextResponse } from 'next/server';
import { isAuthed } from '@/lib/auth';
import { getStore } from '@/lib/db';

type Ctx = { params: Promise<{ key: string }> };
const MAX_NOTES = 20000;

export async function GET(_req: Request, { params }: Ctx) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { key } = await params;
  if (key !== 'notes') return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ value: await getStore().getKV<string>('notes', '') });
}

export async function PUT(req: Request, { params }: Ctx) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { key } = await params;
  if (key !== 'notes') return NextResponse.json({ error: 'not found' }, { status: 404 });
  const { value } = await req.json();
  if (typeof value !== 'string') return NextResponse.json({ error: 'value must be text' }, { status: 400 });
  await getStore().setKV('notes', value.slice(0, MAX_NOTES));
  return NextResponse.json({ ok: true });
}
