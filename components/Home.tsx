'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { greeting, stats, type History } from '@/lib/week';
import type { Task } from '@/lib/types';
import FocusTimer from './FocusTimer';
import Grades from './Grades';
import Notes from './Notes';
import Progress from './Progress';
import Schedule from './Schedule';

interface Props {
  tasks: Task[];
  today: string;
  history: History;
  selectedDay: string | null;
  onPickDay: (date: string | null) => void;
}

export default function Home({ tasks, today, history, selectedDay, onPickDay }: Props) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const s = useMemo(() => stats(tasks, today, history), [tasks, today, history]);

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
        <div className="stat"><b>{s.doneRecently}</b><span>Done this week</span></div>
      </div>

      <Schedule tasks={tasks} today={today} selected={selectedDay} onPick={onPickDay} />
      <div className="pair">
        <Progress history={history} today={today} />
        <FocusTimer />
      </div>
      <Notes />
      <Grades />

      <footer className="foot"><Link href="/settings">Reminder settings</Link></footer>
    </main>
  );
}
