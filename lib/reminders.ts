import { daysBetween } from './dates';
import type { Settings, Task } from './types';

/** Email-to-SMS gateway domains. Resend is email-only, so texts go through the carrier's gateway. */
export const CARRIERS: Record<string, string> = {
  verizon: 'vtext.com',
  att: 'txt.att.net',
  tmobile: 'tmomail.net',
  sprint: 'messaging.sprintpcs.com',
  uscellular: 'email.uscc.net',
  cricket: 'sms.cricketwireless.net',
  boost: 'sms.myboostmobile.com',
  metro: 'mymetropcs.com',
};

export function smsAddress(s: Pick<Settings, 'phone' | 'carrier'>): string | null {
  const digits = s.phone.replace(/\D/g, '').slice(-10);
  const domain = CARRIERS[s.carrier];
  return digits.length === 10 && domain ? `${digits}@${domain}` : null;
}

/** Lead times (days before due) at which a reminder fires. Exams/tests/quizzes get an early heads-up. */
export function windowsFor(task: Task): number[] {
  const big = task.type === 'exam' || task.type === 'test' || task.type === 'quiz';
  return big ? [3, 1, 0] : [1, 0];
}

/** Reminder windows that are due now and not yet sent for this task. */
export function dueWindows(task: Task, today: string): string[] {
  if (task.done || !task.due) return [];
  const days = daysBetween(today, task.due);
  // Fire the tightest window we have reached; skip ones already sent or passed.
  const reached = windowsFor(task).filter((w) => days <= w && days >= 0);
  if (!reached.length) return [];
  const key = `${Math.min(...reached)}d`;
  return task.remindersSent.includes(key) ? [] : [key];
}

export function reminderText(task: Task, today: string): string {
  const days = task.due ? daysBetween(today, task.due) : 0;
  const when = days <= 0 ? 'TODAY' : days === 1 ? 'tomorrow' : `in ${days} days`;
  return `${task.type.toUpperCase()}: ${task.title} - due ${when}`;
}

export async function sendEmail(to: string, subject: string, text: string): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY not set');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({ from: process.env.FROM_EMAIL || 'Todo <onboarding@resend.dev>', to: [to], subject, text }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}

/** Single place to swap in Twilio later. */
export async function sendReminder(settings: Settings, task: Task, today: string): Promise<number> {
  const text = reminderText(task, today);
  let sent = 0;
  const sms = settings.textReminders ? smsAddress(settings) : null;
  if (sms) { await sendEmail(sms, 'Reminder', text); sent++; }
  if (settings.emailReminders && settings.email) { await sendEmail(settings.email, `Reminder: ${task.title}`, text); sent++; }
  return sent;
}
