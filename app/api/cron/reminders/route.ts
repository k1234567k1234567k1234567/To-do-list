import { NextResponse } from 'next/server';
import { nowIn } from '@/lib/dates';
import { getStore } from '@/lib/db';
import { buildDigest, dueWindows, sendDigest } from '@/lib/reminders';

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { today, hour } = nowIn(process.env.APP_TIMEZONE || 'America/New_York');
  if (hour < 7 || hour >= 21) return NextResponse.json({ skipped: 'quiet hours' });

  const store = getStore();
  const due = (await store.list()).flatMap((task) => dueWindows(task, today).map((window) => ({ task, window })));
  const digest = buildDigest(due.map((d) => d.task), today);
  if (!digest) return NextResponse.json({ today, sent: 0, tasks: 0 });

  const { sent, errors } = await sendDigest(await store.getSettings(), digest);
  // Only mark tasks as reminded if the message actually went out, so a failure retries tomorrow.
  if (sent) {
    for (const { task, window } of due) await store.update(task.id, { remindersSent: [...task.remindersSent, window] });
  }
  return NextResponse.json({ today, sent, tasks: digest.count, errors });
}
