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
  const big = task.type === 'exam' || task.type === 'test' || task.type === 'quiz' || task.type === 'bill';
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

const BIG = new Set(['exam', 'test', 'quiz']);
const SMS_MAX = 150;

export interface Digest {
  subject: string;
  text: string;
  sms: string;
  count: number;
}

function dayWord(due: string | null, today: string): string {
  if (!due) return '';
  const d = daysBetween(today, due);
  if (d <= 0) return 'today';
  if (d === 1) return 'tmrw';
  const [y, m, day] = due.split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString('en-US', { weekday: 'short' });
}

/** One message covering every task that has a reminder due. Null when there is nothing to say. */
export function buildDigest(tasks: Task[], today: string): Digest | null {
  if (!tasks.length) return null;
  const days = (t: Task) => (t.due ? daysBetween(today, t.due) : 99);
  const sorted = [...tasks].sort((a, b) => days(a) - days(b) || Number(BIG.has(b.type)) - Number(BIG.has(a.type)) || a.title.localeCompare(b.title));

  const groups: [string, Task[]][] = [
    ['Due today', sorted.filter((t) => days(t) <= 0)],
    ['Due tomorrow', sorted.filter((t) => days(t) === 1)],
    ['Coming up', sorted.filter((t) => days(t) > 1)],
  ];
  const text = groups
    .filter(([, list]) => list.length)
    .map(([name, list]) => `${name}\n${list.map((t) => `- ${t.type.toUpperCase()}: ${t.title}${days(t) > 1 ? ` (${dayWord(t.due, today)})` : ''}`).join('\n')}`)
    .join('\n\n');

  // Texts are short: add items until the next one would overflow, then say how many are left.
  const parts = sorted.map((t) => `${t.title} (${dayWord(t.due, today)})`);
  let sms = 'Due: ';
  let used = 0;
  for (const part of parts) {
    const next = sms + (used ? ', ' : '') + part;
    const rest = parts.length - used - 1;
    if (next.length + (rest ? ` +${rest} more`.length : 0) > SMS_MAX && used > 0) break;
    sms = next;
    used++;
  }
  if (used < parts.length) sms += ` +${parts.length - used} more`;

  const n = tasks.length;
  return { subject: `${n} thing${n === 1 ? '' : 's'} due soon`, text, sms, count: n };
}

/** Sends the digest to every configured destination. Swap in Twilio for texts here later. */
export async function sendDigest(settings: Settings, digest: Digest): Promise<{ sent: number; errors: string[] }> {
  let sent = 0;
  const errors: string[] = [];
  const sms = settings.textReminders ? smsAddress(settings) : null;
  const targets: [string, string, string][] = [];
  if (sms) targets.push(['text', sms, digest.sms]);
  if (settings.emailReminders && settings.email.trim()) targets.push(['email', settings.email.trim(), digest.text]);
  for (const [kind, to, body] of targets) {
    try {
      await sendEmail(to, kind === 'text' ? 'Due soon' : digest.subject, body);
      sent++;
    } catch (e) {
      errors.push(`${kind}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { sent, errors };
}
