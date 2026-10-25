import { NextResponse } from 'next/server';
import { isAuthed } from '@/lib/auth';
import { getStore } from '@/lib/db';
import { CARRIERS, smsAddress } from '@/lib/reminders';
import { DEFAULT_SETTINGS } from '@/lib/types';

export async function GET() {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json({ settings: await getStore().getSettings(), carriers: Object.keys(CARRIERS) });
}

export async function PUT(req: Request) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const b = await req.json();
  const settings = {
    ...DEFAULT_SETTINGS,
    phone: String(b.phone ?? '').slice(0, 20),
    carrier: String(b.carrier ?? ''),
    email: String(b.email ?? '').slice(0, 200),
    textReminders: !!b.textReminders,
    emailReminders: !!b.emailReminders,
  };
  await getStore().saveSettings(settings);
  return NextResponse.json({ settings, smsAddress: smsAddress(settings) });
}
