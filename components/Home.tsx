'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { dotsByDay, greeting, stats, weekDays } from '@/lib/week';
import type { Task } from '@/lib/types';
import FocusTimer from './FocusTimer';
import WeekStrip from './WeekStrip';

interface Props {
  tasks: Task[];
  today: string;
  selectedDay: string | null;
  onPickDay: (date: string | null) => void;
}

export default function Home({ tasks, today, selectedDay, onPickDay }: Props) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const days = useMemo(() => weekDays(today), [today]);
  const dots = useMemo(() => dotsByDay(tasks, days, today), [tasks, days, today]);
  const s = useMemo(() => stats(tasks, today), [tasks, today]);

  return (
    <main className="page">
      <header className="hero">
        <div>
          <p className="eyebrow">{now ? now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }) : ' '}</p>
          <h1>{now ? greeting(now.getHours()) : 'Welcome'}</h1>
        </div>
        <div className="time">{now ? now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : ''}</div>
      </header>

      <div className="stats">
        <div className="stat"><b>{s.dueToday}</b><span>Due today</span></div>
        <div className={`stat${s.overdue ? ' warn' : ''}`}><b>{s.overdue}</b><span>Overdue</span></div>
        <div className="stat"><b>{s.doneRecently}</b><span>Completed</span></div>
      </div>

      <WeekStrip days={days} dots={dots} selected={selectedDay} onPick={onPickDay} />
      <FocusTimer />

      <footer className="foot"><Link href="/settings">Reminder settings</Link></footer>
    </main>
  );
}
