import { NextResponse } from 'next/server';
import { isAuthed } from '@/lib/auth';
import { nowIn } from '@/lib/dates';
import { getStore } from '@/lib/db';
import { reminderText, sendEmail, smsAddress } from '@/lib/reminders';
import type { Task } from '@/lib/types';

/** Sends one sample reminder to every destination the user configured and reports each result. */
export async function POST() {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const s = await getStore().getSettings();
  const { today } = nowIn(process.env.APP_TIMEZONE || 'America/New_York');
  const sample = { title: 'Test reminder', type: 'quiz', due: today } as Task;
  const text = reminderText(sample, today);

  const targets: { kind: 'email' | 'text'; to: string }[] = [];
  const sms = s.textReminders ? smsAddress(s) : null;
  if (sms) targets.push({ kind: 'text', to: sms });
  if (s.email.trim()) targets.push({ kind: 'email', to: s.email.trim() });
  if (!targets.length) return NextResponse.json({ error: 'Add an email, or a phone number and carrier, first.' }, { status: 400 });

  const results = [];
  for (const t of targets) {
    try {
      await sendEmail(t.to, 'Reminder test', text);
      results.push({ ...t, ok: true });
    } catch (e) {
      results.push({ ...t, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return NextResponse.json({ results });
}
