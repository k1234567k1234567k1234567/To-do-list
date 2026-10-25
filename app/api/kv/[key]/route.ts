import { NextResponse } from 'next/server';
import { isAuthed } from '@/lib/auth';
import { getStore } from '@/lib/db';

type Ctx = { params: Promise<{ key: string }> };

/** What each key may hold. `awaiting` is only ever written by the server. */
const KEYS: Record<string, { fallback: unknown; writable: boolean; valid: (v: unknown) => boolean }> = {
  notes: { fallback: '', writable: true, valid: (v) => typeof v === 'string' && v.length <= 20000 },
  grades: {
    fallback: { classes: [] },
    writable: true,
    valid: (v) => !!v && typeof v === 'object' && Array.isArray((v as { classes?: unknown }).classes) && JSON.stringify(v).length <= 50000,
  },
  awaiting: { fallback: [], writable: false, valid: () => false },
};

export async function GET(_req: Request, { params }: Ctx) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const rule = KEYS[(await params).key];
  if (!rule) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ value: await getStore().getKV((await params).key, rule.fallback) });
}

export async function PUT(req: Request, { params }: Ctx) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const key = (await params).key;
  const rule = KEYS[key];
  if (!rule?.writable) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const { value } = await req.json();
  if (!rule.valid(value)) return NextResponse.json({ error: 'invalid value' }, { status: 400 });
  await getStore().setKV(key, value);
  return NextResponse.json({ ok: true });
}
