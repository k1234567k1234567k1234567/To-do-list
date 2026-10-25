'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { daysBetween, toISODate } from '@/lib/dates';
import { FILTERS, matchesDate, matchesFilter, matchesSearch, type FilterId } from '@/lib/filters';
import { priorityOf, scoreTask } from '@/lib/priority';
import type { Task } from '@/lib/types';
import FloatingPanel from './FloatingPanel';
import Home from './Home';
import ReminderSetup from './ReminderSetup';

function dueLabel(due: string | null, today: string): string {
  if (!due) return 'no date';
  const d = daysBetween(today, due);
  if (d < 0) return `${-d}d overdue`;
  if (d === 0) return 'due today';
  if (d === 1) return 'due tomorrow';
  if (d < 7) return `due in ${d} days`;
  return `due ${due}`;
}

export default function TodoApp() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [today, setToday] = useState(() => toISODate(new Date()));
  const [filter, setFilter] = useState<FilterId>('active');
  const [day, setDay] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'priority' | 'due'>('priority');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [needLogin, setNeedLogin] = useState(false);
  const [passcode, setPasscode] = useState('');

  const load = useCallback(async () => {
    setToday(toISODate(new Date())); // priorities re-rank as the date rolls over
    const res = await fetch('/api/tasks');
    if (res.status === 401) return setNeedLogin(true);
    setNeedLogin(false);
    if (res.ok) setTasks(await res.json());
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    window.addEventListener('focus', load);
    return () => { clearInterval(id); window.removeEventListener('focus', load); };
  }, [load]);

  const add = async () => {
    if (!text.trim()) return;
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text, clientDate: toISODate(new Date()) }),
      });
      if (!res.ok) throw new Error();
      const t: Task = await res.json();
      setTasks((ts) => [...ts, t]);
      setText('');
    } catch { setError('Could not add that — try again.'); }
    setBusy(false);
  };

  const toggle = async (t: Task) => {
    setTasks((ts) => ts.map((x) => (x.id === t.id ? { ...x, done: !t.done } : x)));
    await fetch(`/api/tasks/${t.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ done: !t.done }) });
  };
  const remove = async (t: Task) => {
    setTasks((ts) => ts.filter((x) => x.id !== t.id));
    await fetch(`/api/tasks/${t.id}`, { method: 'DELETE' });
  };
  const clearCompleted = async () => {
    setTasks((ts) => ts.filter((x) => !x.done));
    await fetch('/api/tasks/clear-completed', { method: 'POST' });
  };
  const login = async () => {
    const res = await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ passcode }) });
    if (res.ok) { setPasscode(''); setError(''); load(); } else setError('Wrong passcode');
  };

  const visible = useMemo(() => {
    const list = tasks.filter((t) => (day ? matchesDate(t, day) : matchesFilter(t, filter, today)) && matchesSearch(t, query));
    return list.sort((a, b) => {
      if (sort === 'due') return (a.due ?? '9999').localeCompare(b.due ?? '9999');
      return scoreTask(b, today) - scoreTask(a, today) || (a.due ?? '9999').localeCompare(b.due ?? '9999');
    });
  }, [tasks, filter, day, query, sort, today]);

  const dueSoon = tasks.filter((t) => !t.done && t.due && daysBetween(today, t.due) <= 1).length;

  return (
    <>
      <Home tasks={tasks} today={today} selectedDay={day} onPickDay={setDay} />
      <FloatingPanel title="To-Do" badge={dueSoon}>
        {needLogin ? (
          <div className="add">
            <input type="password" placeholder="Passcode" value={passcode} onChange={(e) => setPasscode(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && login()} />
            <button className="btn" onClick={login}>Unlock</button>
            {error && <div className="err">{error}</div>}
          </div>
        ) : (
          <>
            <div className="add">
              <textarea placeholder="Describe an assignment in as much detail as you like… e.g. “Bio exam on chapters 4-6 this Friday, bring a calculator”"
                value={text} onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) add(); }} />
              <button className="btn" onClick={add} disabled={busy || !text.trim()}>{busy ? 'Summarizing…' : 'Add'}</button>
              {error && <div className="err">{error}</div>}
            </div>
            <div className="row">
              <select value={filter} onChange={(e) => setFilter(e.target.value as FilterId)} aria-label="Filter">
                {FILTERS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
              </select>
              <select value={sort} onChange={(e) => setSort(e.target.value as 'priority' | 'due')} aria-label="Sort" style={{ width: 'auto' }}>
                <option value="priority">Priority</option>
                <option value="due">Due date</option>
              </select>
            </div>
            <input type="search" placeholder="Search tasks…" value={query} onChange={(e) => setQuery(e.target.value)} />
            {day && (
              <button className="chip" onClick={() => setDay(null)}>
                Showing {new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} ×
              </button>
            )}
            {filter === 'completed' && tasks.some((t) => t.done) && (
              <button className="btn ghost" onClick={clearCompleted}>Clear completed</button>
            )}
            {visible.length === 0 && <div className="empty">Nothing here.</div>}
            {visible.map((t) => {
              const p = priorityOf(t, today);
              return (
                <div key={t.id} className={`task ${t.done ? 'done' : p}`}>
                  <input type="checkbox" checked={t.done} onChange={() => toggle(t)} aria-label={`Complete ${t.title}`} />
                  <div className="t-main">
                    <div className="t-title">{t.title}</div>
                    <div className="t-meta">
                      {!t.done && <span className={`pill ${p}`}>{p}</span>}
                      <span>{t.type}</span>
                      <span>{dueLabel(t.due, today)}</span>
                    </div>
                  </div>
                  <button className="x" onClick={() => remove(t)} aria-label="Delete">×</button>
                </div>
              );
            })}
            <ReminderSetup onNeedLogin={() => setNeedLogin(true)} />
          </>
        )}
      </FloatingPanel>
    </>
  );
}
