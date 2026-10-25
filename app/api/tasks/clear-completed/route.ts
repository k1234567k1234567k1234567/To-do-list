import { NextResponse } from 'next/server';
import { isAuthed } from '@/lib/auth';
import { getStore } from '@/lib/db';

export async function POST() {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json({ removed: await getStore().clearCompleted() });
}
