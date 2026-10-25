import { NextResponse } from 'next/server';
import { isAuthed } from '@/lib/auth';
import { getStore } from '@/lib/db';
import { nowIn } from '@/lib/dates';
import { cleanCourse, isTaskType } from '@/lib/parse';
import type { AwaitingItem } from '@/lib/grades';
import { isGraded } from '@/lib/types';
import type { History } from '@/lib/week';

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  const patch: Record<string, unknown> = {};
  const store = getStore();
  if (typeof body.done === 'boolean') {
    patch.done = body.done;
    patch.completedAt = body.done ? new Date().toISOString() : null;
    // Log completions separately so streaks survive "Clear completed".
    const before = (await store.list()).find((t) => t.id === id);
    if (before && before.done !== body.done) {
      // Graded tasks wait on their grade; the list lives outside the task so "Clear completed" cannot lose it.
      const awaiting = await store.getKV<AwaitingItem[]>('awaiting', []);
      const rest = awaiting.filter((a) => a.id !== id);
      const graded = typeof body.graded === 'boolean' ? body.graded : isGraded(before);
      await store.setKV('awaiting', body.done && graded
        ? [...rest, { id, title: before.title, course: before.course ?? null, type: before.type, doneAt: new Date().toISOString() }]
        : rest);
      const { today } = nowIn(process.env.APP_TIMEZONE || 'America/New_York');
      const history = await store.getKV<History>('history', {});
      history[today] = Math.max(0, (history[today] ?? 0) + (body.done ? 1 : -1));
      await store.setKV('history', history);
    }
  }
  if ('course' in body) patch.course = cleanCourse(body.course);
  if (typeof body.graded === 'boolean') patch.graded = body.graded;
  if (typeof body.title === 'string' && body.title.trim()) patch.title = body.title.trim().slice(0, 120);
  if (isTaskType(body.type)) patch.type = body.type;
  if (body.due === null || /^\d{4}-\d{2}-\d{2}$/.test(body.due ?? '')) {
    patch.due = body.due;
    patch.remindersSent = []; // new date, new reminders
  }
  const task = await store.update(id, patch);
  return task ? NextResponse.json(task) : NextResponse.json({ error: 'not found' }, { status: 404 });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  await getStore().remove((await params).id);
  return NextResponse.json({ ok: true });
}
