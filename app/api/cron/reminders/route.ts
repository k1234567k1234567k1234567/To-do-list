import { NextResponse } from 'next/server';
import { nowIn } from '@/lib/dates';
import { getStore } from '@/lib/db';
import { dueWindows, sendReminder } from '@/lib/reminders';

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { today, hour } = nowIn(process.env.APP_TIMEZONE || 'America/New_York');
  if (hour < 7 || hour >= 21) return NextResponse.json({ skipped: 'quiet hours' });

  const store = getStore();
  const settings = await store.getSettings();
  const results: { id: string; window: string; sent: number; error?: string }[] = [];
  for (const task of await store.list()) {
    for (const window of dueWindows(task, today)) {
      try {
        const sent = await sendReminder(settings, task, today);
        // Only mark sent if something actually went out, so a missing config retries later.
        if (sent) await store.update(task.id, { remindersSent: [...task.remindersSent, window] });
        results.push({ id: task.id, window, sent });
      } catch (e) {
        results.push({ id: task.id, window, sent: 0, error: String(e) });
      }
    }
  }
  return NextResponse.json({ today, results });
}
