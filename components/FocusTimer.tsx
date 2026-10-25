'use client';
import { useEffect, useRef, useState } from 'react';

const KEY = 'todo-focus';
const MODES = { focus: 25 * 60, break: 5 * 60 } as const;
type Mode = keyof typeof MODES;

interface Saved { mode: Mode; left: number; endsAt: number | null }

const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

/** 25/5 timer. Stores an end timestamp, so a reload or a background tab keeps the right time. */
export default function FocusTimer() {
  const [mode, setMode] = useState<Mode>('focus');
  const [left, setLeft] = useState<number>(MODES.focus);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const ready = useRef(false);

  useEffect(() => {
    try {
      const s: Saved | null = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (s && s.mode in MODES) {
        setMode(s.mode);
        if (s.endsAt) {
          const rem = Math.round((s.endsAt - Date.now()) / 1000);
          if (rem > 0) { setEndsAt(s.endsAt); setLeft(rem); } else setLeft(MODES[s.mode]);
        } else setLeft(Math.min(Math.max(s.left, 0), MODES[s.mode]));
      }
    } catch {}
    ready.current = true;
  }, []);

  useEffect(() => {
    if (!ready.current) return;
    try { localStorage.setItem(KEY, JSON.stringify({ mode, left, endsAt } satisfies Saved)); } catch {}
  }, [mode, left, endsAt]);

  useEffect(() => {
    if (!endsAt) return;
    const id = setInterval(() => {
      const rem = Math.round((endsAt - Date.now()) / 1000);
      if (rem <= 0) { setEndsAt(null); setLeft(0); } else setLeft(rem);
    }, 500);
    return () => clearInterval(id);
  }, [endsAt]);

  const running = endsAt !== null;
  const toggle = () => {
    if (running) { setEndsAt(null); return; }
    const start = left > 0 ? left : MODES[mode];
    setLeft(start);
    setEndsAt(Date.now() + start * 1000);
  };
  const choose = (m: Mode) => { setMode(m); setEndsAt(null); setLeft(MODES[m]); };
  const done = left === 0 && !running;

  return (
    <section className="card timer" aria-label="Focus timer">
      <div className="card-head">
        <h2>Focus</h2>
        <div className="seg" role="group" aria-label="Timer mode">
          {(['focus', 'break'] as Mode[]).map((m) => (
            <button key={m} className={mode === m ? 'on' : ''} onClick={() => choose(m)}>{m === 'focus' ? '25 min' : '5 min'}</button>
          ))}
        </div>
      </div>
      <div className="clock-face" aria-live="off">{fmt(left)}</div>
      <div className="row">
        <button className="btn" onClick={toggle}>{running ? 'Pause' : done ? 'Again' : 'Start'}</button>
        <button className="btn ghost" onClick={() => choose(mode)}>Reset</button>
      </div>
      {done && <div className="muted">{mode === 'focus' ? 'Nice work. Take a short break.' : 'Break over. Ready when you are.'}</div>}
    </section>
  );
}
