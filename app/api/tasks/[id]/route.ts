import { NextResponse } from 'next/server';
import { isAuthed } from '@/lib/auth';
import { getStore } from '@/lib/db';
import { isTaskType } from '@/lib/parse';

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  const patch: Record<string, unknown> = {};
  if (typeof body.done === 'boolean') patch.done = body.done;
  if (typeof body.title === 'string' && body.title.trim()) patch.title = body.title.trim().slice(0, 120);
  if (isTaskType(body.type)) patch.type = body.type;
  if (body.due === null || /^\d{4}-\d{2}-\d{2}$/.test(body.due ?? '')) {
    patch.due = body.due;
    patch.remindersSent = []; // new date, new reminders
  }
  const task = await getStore().update(id, patch);
  return task ? NextResponse.json(task) : NextResponse.json({ error: 'not found' }, { status: 404 });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  await getStore().remove((await params).id);
  return NextResponse.json({ ok: true });
}
