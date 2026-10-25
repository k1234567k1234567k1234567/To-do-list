import { NextResponse } from 'next/server';
import { sessionToken } from '@/lib/auth';

export async function POST(req: Request) {
  const { passcode } = await req.json();
  if (!process.env.APP_PASSCODE || passcode !== process.env.APP_PASSCODE) {
    return NextResponse.json({ error: 'wrong passcode' }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set('todo_session', sessionToken(), {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 60 * 60 * 24 * 90, path: '/',
  });
  return res;
}
