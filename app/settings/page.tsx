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

  useEffect(() => {
    fetch('/api/settings').then((r) => r.json()).then((d) => { setS(d.settings); setCarriers(d.carriers); });
  }, []);

  const save = async () => {
    const res = await fetch('/api/settings', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(s) });
    const d = await res.json();
    setMsg(res.ok ? (d.smsAddress ? `Saved. Texts go to ${d.smsAddress}` : 'Saved. Add a 10-digit phone and carrier to enable texts.') : 'Save failed');
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
      <button className="btn" onClick={save}>Save</button>
      {msg && <div>{msg}</div>}
    </main>
  );
}
