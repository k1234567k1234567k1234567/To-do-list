import { NextResponse } from 'next/server';
import { isAuthed } from '@/lib/auth';
import { nowIn, toISODate } from '@/lib/dates';
import { getStore } from '@/lib/db';
import { buildDigest, sendDigest, smsAddress } from '@/lib/reminders';
import type { Task } from '@/lib/types';

/** Sends a sample digest to every destination the user configured and reports each result. */
export async function POST() {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const s = await getStore().getSettings();
  const hasText = s.textReminders && !!smsAddress(s);
  if (!hasText && !(s.emailReminders && s.email.trim())) {
    return NextResponse.json({ error: 'Add an email, or a phone number and carrier, first.' }, { status: 400 });
  }
  const { today } = nowIn(process.env.APP_TIMEZONE || 'America/New_York');
  const [y, m, d] = today.split('-').map(Number);
  const plus = (n: number) => toISODate(new Date(y, m - 1, d + n));
  const sample = [
    { title: 'Sample chem quiz', type: 'quiz', due: plus(1) },
    { title: 'Sample math homework', type: 'assignment', due: today },
    { title: 'Sample history exam', type: 'exam', due: plus(3) },
  ] as Task[];
  const digest = buildDigest(sample, today)!;
  const { sent, errors } = await sendDigest(s, digest);
  return NextResponse.json({ sent, errors, preview: digest.text });
}
