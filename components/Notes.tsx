'use client';
import { useEffect, useRef, useState } from 'react';

type Status = 'loading' | 'idle' | 'saving' | 'saved' | 'error';

/** Scratchpad that autosaves to the database shortly after you stop typing. */
export default function Notes() {
  const [value, setValue] = useState('');
  const [status, setStatus] = useState<Status>('loading');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = useRef(false);

  useEffect(() => {
    fetch('/api/kv/notes')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && !dirty.current) setValue(d.value ?? ''); setStatus('idle'); })
      .catch(() => setStatus('idle'));
  }, []);

  const save = async (text: string) => {
    setStatus('saving');
    try {
      const res = await fetch('/api/kv/notes', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ value: text }) });
      setStatus(res.ok ? 'saved' : 'error');
    } catch { setStatus('error'); }
  };

  const onChange = (text: string) => {
    dirty.current = true;
    setValue(text);
    setStatus('idle');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => save(text), 800);
  };

  return (
    <section className="card" aria-label="Notes">
      <div className="card-head">
        <h2>Notes</h2>
        <span className="muted">{{ loading: '', idle: '', saving: 'Saving…', saved: 'Saved', error: 'Not saved. Check your connection.' }[status]}</span>
      </div>
      <textarea className="notes" value={value} onChange={(e) => onChange(e.target.value)} maxLength={20000}
        placeholder="Jot anything down: reminders, ideas, things to ask a teacher." aria-label="Notes" />
    </section>
  );
}
