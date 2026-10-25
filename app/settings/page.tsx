'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { Settings } from '@/lib/types';

const NAMES: Record<string, string> = {
  verizon: 'Verizon', att: 'AT&T', tmobile: 'T-Mobile', sprint: 'Sprint', uscellular: 'US Cellular',
  cricket: 'Cricket', boost: 'Boost', metro: 'Metro',
};

export default function SettingsPage() {
  const [s, setS] = useState<Settings | null>(null);
  const [carriers, setCarriers] = useState<string[]>([]);
  const [msg, setMsg] = useState('');
  const [testMsg, setTestMsg] = useState<string[]>([]);

  useEffect(() => {
    fetch('/api/settings').then((r) => r.json()).then((d) => { setS(d.settings); setCarriers(d.carriers); });
  }, []);

  const save = async () => {
    const res = await fetch('/api/settings', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(s) });
    const d = await res.json();
    setMsg(res.ok ? (d.smsAddress ? `Saved. Texts go to ${d.smsAddress}` : 'Saved. Add a 10-digit phone and carrier to enable texts.') : 'Save failed');
  };

  const test = async () => {
    setTestMsg(['Sending…']);
    const res = await fetch('/api/settings/test', { method: 'POST' });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return setTestMsg([d.error || 'Test failed.']);
    setTestMsg(d.results.map((r: { kind: string; ok: boolean; error?: string }) =>
      r.ok ? `Sent to your ${r.kind}. Check it now.` : `${r.kind === 'text' ? 'Text' : 'Email'} failed: ${r.error}`));
  };

  if (!s) return <main className="settings">Loading…</main>;
  const set = (p: Partial<Settings>) => setS({ ...s, ...p });
  return (
    <main className="settings">
      <Link href="/">← Back</Link>
      <h1>Reminder settings</h1>
      <label>Phone number<input inputMode="tel" placeholder="5551234567" value={s.phone} onChange={(e) => set({ phone: e.target.value })} /></label>
      <label>Carrier
        <select value={s.carrier} onChange={(e) => set({ carrier: e.target.value })}>
          <option value="">Select…</option>
          {carriers.map((c) => <option key={c} value={c}>{NAMES[c] ?? c}</option>)}
        </select>
      </label>
      <label className="check"><input type="checkbox" checked={s.textReminders} onChange={(e) => set({ textReminders: e.target.checked })} /> Text me (via carrier email-to-SMS gateway)</label>
      <label>Email<input type="email" value={s.email} onChange={(e) => set({ email: e.target.value })} /></label>
      <label className="check"><input type="checkbox" checked={s.emailReminders} onChange={(e) => set({ emailReminders: e.target.checked })} /> Also email me</label>
      <div className="row">
        <button className="btn" onClick={save}>Save</button>
        <button className="btn ghost" onClick={test}>Send test reminder</button>
      </div>
      {msg && <div>{msg}</div>}
      {testMsg.map((m, i) => <div key={i} className={m.includes('failed') ? 'err' : 'muted'}>{m}</div>)}
      <p className="muted">Until you verify a domain in Resend, it can only deliver to the email address of your Resend account. Texts through a carrier address need a verified domain.</p>
    </main>
  );
}
