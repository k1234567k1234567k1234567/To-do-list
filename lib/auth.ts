import { cookies } from 'next/headers';
import { createHash } from 'node:crypto';

const token = () => createHash('sha256').update(`todo:${process.env.APP_PASSCODE}`).digest('hex');

export function sessionToken() { return token(); }

/** True when no passcode is configured (local dev) or the session cookie matches. */
export async function isAuthed(): Promise<boolean> {
  if (!process.env.APP_PASSCODE) return true;
  return (await cookies()).get('todo_session')?.value === token();
}
