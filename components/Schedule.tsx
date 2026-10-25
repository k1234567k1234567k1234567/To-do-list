'use client';
import { useEffect, useMemo, useState } from 'react';
import type { Task } from '@/lib/types';
import { dotsByDay, monthGrid, weekDays } from '@/lib/week';

interface Props {
  tasks: Task[];
  today: string;
  selected: string | null;
  onPick: (date: string | null) => void;
}

const VIEW_KEY = 'todo-schedule-view';
const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export default function Schedule({ tasks, today, selected, onPick }: Props) {
  const [view, setView] = useState<'week' | 'month'>('week');
  const [ty, tm] = today.split('-').map(Number);
  const [cursor, setCursor] = useState({ year: ty, month: tm - 1 });

  useEffect(() => {
    try { if (localStorage.getItem(VIEW_KEY) === 'month') setView('month'); } catch {}
  }, []);
  const choose = (v: 'week' | 'month') => {
    setView(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch {}
  };

  const days = useMemo(() => weekDays(today), [today]);
  const grid = useMemo(() => monthGrid(cursor.year, cursor.month), [cursor]);
  const dots = useMemo(() => dotsByDay(tasks, view === 'week' ? days : grid.flat(), today), [tasks, view, days, grid, today]);
  const move = (n: number) => setCursor((c) => {
    const d = new Date(c.year, c.month + n, 1);
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const title = new Date(cursor.year, cursor.month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  const cell = (date: string, label: string, dim = false) => {
    const list = dots[date] ?? [];
    return (
      <button
        key={date}
        className={`day${date === today ? ' today' : ''}${selected === date ? ' sel' : ''}${dim ? ' dim' : ''}`}
        onClick={() => onPick(selected === date ? null : date)}
        aria-pressed={selected === date}
        aria-label={`${date}, ${list.length} due`}
      >
        <span className="dn">{label}</span>
        <span className="dots">
          {list.slice(0, 3).map((p, i) => <i key={i} className={`dot ${p}`} />)}
          {list.length > 3 && <span className="more">+{list.length - 3}</span>}
        </span>
      </button>
    );
  };

  return (
    <section className="card" aria-label="Schedule">
      <div className="card-head">
        {view === 'week' ? <h2>Next 7 days</h2> : (
          <div className="monthnav">
            <button onClick={() => move(-1)} aria-label="Previous month">‹</button>
            <h2>{title}</h2>
            <button onClick={() => move(1)} aria-label="Next month">›</button>
          </div>
        )}
        <div className="seg" role="group" aria-label="Calendar view">
          <button className={view === 'week' ? 'on' : ''} onClick={() => choose('week')}>Week</button>
          <button className={view === 'month' ? 'on' : ''} onClick={() => choose('month')}>Month</button>
        </div>
      </div>
      {view === 'week' ? (
        <div className="week">
          {days.map((d) => (
            <div key={d.date} className="wcol">
              <span className="dl">{d.label}</span>
              {cell(d.date, String(d.day))}
            </div>
          ))}
        </div>
      ) : (
        <div className="month">
          {DOW.map((l, i) => <span key={i} className="dl">{l}</span>)}
          {grid.flat().map((c) => cell(c.date, String(c.day), !c.inMonth))}
        </div>
      )}
    </section>
  );
}
