'use client';
import type { Priority } from '@/lib/priority';
import type { WeekDay } from '@/lib/week';

interface Props {
  days: WeekDay[];
  dots: Record<string, Priority[]>;
  selected: string | null;
  onPick: (date: string | null) => void;
}

export default function WeekStrip({ days, dots, selected, onPick }: Props) {
  return (
    <section className="card" aria-label="Next seven days">
      <div className="card-head"><h2>Next 7 days</h2></div>
      <div className="week">
        {days.map((d) => {
          const list = dots[d.date] ?? [];
          return (
            <button
              key={d.date}
              className={`day${d.isToday ? ' today' : ''}${selected === d.date ? ' sel' : ''}`}
              onClick={() => onPick(selected === d.date ? null : d.date)}
              aria-pressed={selected === d.date}
              aria-label={`${d.label} ${d.day}, ${list.length} due`}
            >
              <span className="dl">{d.label}</span>
              <span className="dn">{d.day}</span>
              <span className="dots">
                {list.slice(0, 4).map((p, i) => <i key={i} className={`dot ${p}`} />)}
                {list.length > 4 && <span className="more">+{list.length - 4}</span>}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
