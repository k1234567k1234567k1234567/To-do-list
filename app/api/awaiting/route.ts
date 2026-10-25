import { NextResponse } from 'next/server';
import { isAuthed } from '@/lib/auth';
import { getStore } from '@/lib/db';
import type { AwaitingItem } from '@/lib/grades';

export async function GET() {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json(await getStore().getKV<AwaitingItem[]>('awaiting', []));
}
