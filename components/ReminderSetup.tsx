'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { smsAddress } from '@/lib/reminders';
import type { Settings } from '@/lib/types';

interface TestResult { sent: number; errors: string[] }

/** Asks where reminders should go and lets the user prove it works. */
export default function ReminderSetup({ onNeedLogin }: { onNeedLogin?: () => void }) {
  const [s, setS] = useState<Settings | null>(null);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [results, setResults] = useState<TestResult | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/settings');
    if (res.status === 401) return onNeedLogin?.();
    if (res.ok) setS((await res.json()).settings);
  }, [onNeedLogin]);
  useEffect(() => { load(); }, [load]);

  if (!s) return null;
  const hasEmail = s.emailReminders && !!s.email;
  const hasText = s.textReminders && !!smsAddress(s);
  const configured = hasEmail || hasText;

  const save = async () => {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setMsg('Enter a valid email address.');
    setBusy(true); setMsg('');
    const res = await fetch('/api/settings', {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...s, email: email.trim(), emailReminders: true }),
    });
    setBusy(false);
    if (res.ok) { setS((await res.json()).settings); setEmail(''); } else setMsg('Could not save. Try again.');
  };

  const test = async () => {
    setBusy(true); setMsg(''); setResults(null);
    const res = await fetch('/api/settings/test', { method: 'POST' });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMsg(d.error || 'Test failed.');
    setResults(d);
  };

  if (!configured) {
    return (
      <div className="setup">
        <strong>Where should reminders go?</strong>
        <input type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()} aria-label="Email for reminders" />
        <button className="btn" onClick={save} disabled={busy}>Save email</button>
        <span className="muted">Want texts too? <Link href="/settings">Add phone and carrier</Link></span>
        {msg && <div className="err">{msg}</div>}
      </div>
    );
  }

  return (
    <div className="setup ok">
      <span className="muted">Reminders: {[hasEmail && `email to ${s.email}`, hasText && 'text'].filter(Boolean).join(' + ')}</span>
      <button className="btn ghost" onClick={test} disabled={busy}>{busy ? 'Sending…' : 'Send test reminder'}</button>
      {msg && <div className="err">{msg}</div>}
      {results && results.sent > 0 && <div className="good">Test digest sent. Check your inbox.</div>}
      {results?.errors.map((e, i) => <div key={i} className="err">{e}</div>)}
    </div>
  );
}
