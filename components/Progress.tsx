'use client';
import { useMemo } from 'react';
import { lastSevenDays, streak, type History } from '@/lib/week';

export default function Progress({ history, today }: { history: History; today: string }) {
  const days = useMemo(() => lastSevenDays(history, today), [history, today]);
  const run = useMemo(() => streak(history, today), [history, today]);
  const total = days.reduce((a, d) => a + d.count, 0);
  const max = Math.max(1, ...days.map((d) => d.count));

  return (
    <section className="card" aria-label="Progress">
      <div className="card-head"><h2>Progress</h2></div>
      <div className="streak">
        <b>{run}</b>
        <span>{run === 1 ? 'day streak' : 'day streak'}</span>
      </div>
      <div className="bars" role="img" aria-label={`${total} tasks completed in the last 7 days`}>
        {days.map((d) => (
          <div key={d.date} className={`bar${d.date === today ? ' now' : ''}`}>
            <span className="bv">{d.count || ''}</span>
            <span className="bt"><i style={{ height: `${(d.count / max) * 100}%` }} /></span>
            <span className="bl">{d.label[0]}</span>
          </div>
        ))}
      </div>
      <div className="muted">{total === 0 ? 'Check off a task to start your streak.' : `${total} finished in the last 7 days`}</div>
    </section>
  );
}
