'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { daysBetween, toISODate } from '@/lib/dates';
import { FILTERS, courseSlot, matchesCourse, matchesDate, matchesFilter, matchesSearch, type FilterId } from '@/lib/filters';
import { priorityOf, scoreTask } from '@/lib/priority';
import { TASK_TYPES, isGraded, isSchoolType, type Task, type TaskType } from '@/lib/types';
import type { History } from '@/lib/week';
import FloatingPanel from './FloatingPanel';
import Home from './Home';
import ReminderSetup from './ReminderSetup';
import UndoToast from './UndoToast';

const UNDO_MS = 6000;
const JSON_HEADERS = { 'content-type': 'application/json' };

function dueLabel(due: string | null, today: string): string {
  if (!due) return 'no date';
  const d = daysBetween(today, due);
  if (d < 0) return `${-d}d overdue`;
  if (d === 0) return 'due today';
  if (d === 1) return 'due tomorrow';
  if (d < 7) return `due in ${d} days`;
  return `due ${due}`;
}

interface Draft { title: string; due: string; type: TaskType; course: string; graded: boolean }
interface Pending { tasks: Task[]; clear: boolean; timer: ReturnType<typeof setTimeout> }

export default function TodoApp() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [history, setHistory] = useState<History>({});
  const [today, setToday] = useState(() => toISODate(new Date()));
  const [filter, setFilter] = useState<FilterId>('active');
  const [course, setCourse] = useState('');
  const [day, setDay] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'priority' | 'due'>('priority');
  const [text, setText] = useState('');
  const [multi, setMulti] = useState(false);
  const [progress, setProgress] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [needLogin, setNeedLogin] = useState(false);
  const [passcode, setPasscode] = useState('');
  const [editing, setEditing] = useState<{ id: string; draft: Draft } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const pending = useRef<Pending | null>(null);
  // Check-offs update shared lists (history, waiting-for-grade) on the server, so they go one at a time.
  const patchQueue = useRef<Promise<unknown>>(Promise.resolve());

  const load = useCallback(async () => {
    setToday(toISODate(new Date())); // priorities re-rank as the date rolls over
    const res = await fetch('/api/tasks');
    if (res.status === 401) return setNeedLogin(true);
    setNeedLogin(false);
    if (res.ok) {
      // Tasks waiting out their undo window are still on the server; keep them hidden.
      const held = new Set(pending.current?.tasks.map((t) => t.id));
      setTasks((await res.json() as Task[]).filter((t) => !held.has(t.id)));
    }
    const h = await fetch('/api/history');
    if (h.ok) setHistory(await h.json());
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    window.addEventListener('focus', load);
    return () => { clearInterval(id); window.removeEventListener('focus', load); };
  }, [load]);

  /** Send the held delete to the server. */
  const commit = useCallback(() => {
    const p = pending.current;
    if (!p) return;
    clearTimeout(p.timer);
    pending.current = null;
    setToast(null);
    if (p.clear) fetch('/api/tasks/clear-completed', { method: 'POST', keepalive: true });
    else for (const t of p.tasks) fetch(`/api/tasks/${t.id}`, { method: 'DELETE', keepalive: true });
  }, []);

  // Closing the tab must not lose a delete the user already saw happen.
  useEffect(() => {
    window.addEventListener('pagehide', commit);
    return () => window.removeEventListener('pagehide', commit);
  }, [commit]);

  const hold = (removed: Task[], clear: boolean) => {
    commit(); // finish any earlier delete first
    setTasks((ts) => ts.filter((t) => !removed.some((r) => r.id === t.id)));
    pending.current = { tasks: removed, clear, timer: setTimeout(commit, UNDO_MS) };
    setToast(removed.length === 1 ? 'Deleted 1 task' : `Deleted ${removed.length} tasks`);
  };
  const undo = () => {
    const p = pending.current;
    if (!p) return;
    clearTimeout(p.timer);
    pending.current = null;
    setTasks((ts) => [...ts, ...p.tasks]);
    setToast(null);
  };

  /** Several lines at once: sent in small batches so each request stays quick; lines that fail stay in the box. */
  const addMany = async () => {
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 30);
    if (!lines.length) return;
    setBusy(true); setError(''); setProgress(`Added 0 of ${lines.length}`);
    const failed: string[] = [];
    let done = 0;
    for (let i = 0; i < lines.length; i += 5) {
      const chunk = lines.slice(i, i + 5);
      try {
        const res = await fetch('/api/tasks', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ texts: chunk, clientDate: toISODate(new Date()) }) });
        if (!res.ok) throw new Error();
        const made: Task[] = await res.json();
        setTasks((ts) => [...ts, ...made]);
        done += made.length;
      } catch { failed.push(...chunk); }
      setProgress(`Added ${done} of ${lines.length}`);
    }
    setText(failed.join('\n'));
    setError(failed.length ? `${failed.length} line${failed.length === 1 ? '' : 's'} did not add. They are still in the box, so you can try again.` : '');
    if (!failed.length) setMulti(false);
    setBusy(false);
  };

  const add = async () => {
    if (multi) return addMany();
    if (!text.trim()) return;
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/tasks', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ text, clientDate: toISODate(new Date()) }) });
      if (!res.ok) throw new Error();
      const t: Task = await res.json();
      setTasks((ts) => [...ts, t]);
      setText('');
    } catch { setError('Could not add that — try again.'); }
    setBusy(false);
  };

  const toggle = (t: Task) => {
    setTasks((ts) => ts.map((x) => (x.id === t.id ? { ...x, done: !t.done } : x)));
    patchQueue.current = patchQueue.current.then(async () => {
      await fetch(`/api/tasks/${t.id}`, { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify({ done: !t.done }) });
      const h = await fetch('/api/history');
      if (h.ok) setHistory(await h.json());
      window.dispatchEvent(new Event('todo:changed')); // the Grades card refreshes its waiting list
    }).catch(() => {});
  };

  const startEdit = (t: Task) =>
    setEditing({ id: t.id, draft: { title: t.title, due: t.due ?? '', type: t.type, course: t.course ?? '', graded: isGraded(t) } });
  const saveEdit = async () => {
    if (!editing) return;
    const { id, draft } = editing;
    if (!draft.title.trim()) return;
    const res = await fetch(`/api/tasks/${id}`, {
      method: 'PATCH', headers: JSON_HEADERS,
      body: JSON.stringify({
        title: draft.title, due: draft.due || null, type: draft.type,
        course: isSchoolType(draft.type) ? draft.course || null : null,
        graded: isSchoolType(draft.type) ? draft.graded : false,
      }),
    });
    if (res.ok) {
      const updated: Task = await res.json();
      setTasks((ts) => ts.map((x) => (x.id === id ? updated : x)));
      setEditing(null);
    } else setError('Could not save that change.');
  };

  const login = async () => {
    const res = await fetch('/api/login', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ passcode }) });
    if (res.ok) { setPasscode(''); setError(''); load(); } else setError('Wrong passcode');
  };

  const courses = useMemo(() => [...new Set(tasks.map((t) => t.course).filter((c): c is string => !!c))].sort(), [tasks]);
  const activeCourse = courses.includes(course) ? course : '';

  const visible = useMemo(() => {
    const list = tasks.filter((t) =>
      (day ? matchesDate(t, day) : matchesFilter(t, filter, today)) && matchesCourse(t, activeCourse) && matchesSearch(t, query));
    return list.sort((a, b) => {
      if (sort === 'due') return (a.due ?? '9999').localeCompare(b.due ?? '9999');
      return scoreTask(b, today) - scoreTask(a, today) || (a.due ?? '9999').localeCompare(b.due ?? '9999');
    });
  }, [tasks, filter, activeCourse, day, query, sort, today]);

  const dueSoon = tasks.filter((t) => !t.done && t.due && daysBetween(today, t.due) <= 1).length;

  return (
    <>
      <Home tasks={tasks} today={today} history={history} selectedDay={day} onPickDay={setDay} />
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
              <textarea placeholder={multi ? 'One task per line, e.g.\nOct 28 - Unit 3 Test\nNov 4 - Quiz on 4-2 to 4-4' : 'Describe a task in as much detail as you like… e.g. “Bio exam on chapters 4-6 this Friday” or “Dentist Tuesday 3pm”'}
                value={text} onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) add(); }} />
              <button className="btn" onClick={add} disabled={busy || !text.trim()}>{busy ? 'Summarizing…' : multi ? `Add ${Math.min(30, text.split('\n').filter((l) => l.trim()).length)} tasks` : 'Add'}</button>
              <button className="linkish" onClick={() => { setMulti(!multi); setError(''); setProgress(''); }}>{multi ? 'Add one task' : 'Add several at once'}</button>
              {progress && multi && <div className="muted">{progress}</div>}
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
            {courses.length > 0 && (
              <select value={activeCourse} onChange={(e) => setCourse(e.target.value)} aria-label="Class">
                <option value="">All classes</option>
                {courses.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            )}
            <input type="search" placeholder="Search tasks…" value={query} onChange={(e) => setQuery(e.target.value)} />
            {day && (
              <button className="chip" onClick={() => setDay(null)}>
                Showing {new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} ×
              </button>
            )}
            {filter === 'completed' && tasks.some((t) => t.done) && (
              <button className="btn ghost" onClick={() => hold(tasks.filter((t) => t.done), true)}>Clear completed</button>
            )}
            {visible.length === 0 && <div className="empty">Nothing here.</div>}
            {visible.map((t) => {
              const p = priorityOf(t, today);
              if (editing?.id === t.id) {
                const d = editing.draft;
                const set = (patch: Partial<Draft>) => setEditing({ id: t.id, draft: { ...d, ...patch } });
                return (
                  <div key={t.id} className="task editing">
                    <div className="t-main edit">
                      <input value={d.title} onChange={(e) => set({ title: e.target.value })} aria-label="Title" maxLength={120} />
                      <div className="row">
                        <input type="date" value={d.due} onChange={(e) => set({ due: e.target.value })} aria-label="Due date" />
                        <select value={d.type} onChange={(e) => set({ type: e.target.value as TaskType })} aria-label="Type">
                          {TASK_TYPES.map((x) => <option key={x} value={x}>{x}</option>)}
                        </select>
                      </div>
                      {isSchoolType(d.type) && (
                        <>
                          <input value={d.course} onChange={(e) => set({ course: e.target.value })} list="course-list" placeholder="Class (optional)" aria-label="Class" maxLength={30} />
                          <label className="check"><input type="checkbox" checked={d.graded} onChange={(e) => set({ graded: e.target.checked })} /> This will be graded</label>
                        </>
                      )}
                      <div className="row">
                        <button className="btn" onClick={saveEdit} disabled={!d.title.trim()}>Save</button>
                        <button className="btn ghost" onClick={() => setEditing(null)}>Cancel</button>
                      </div>
                    </div>
                  </div>
                );
              }
              return (
                <div key={t.id} className={`task ${t.done ? 'done' : p}`}>
                  <input type="checkbox" checked={t.done} onChange={() => toggle(t)} aria-label={`Complete ${t.title}`} />
                  <div className="t-main">
                    <div className="t-title">{t.title}</div>
                    <div className="t-meta">
                      {!t.done && <span className={`pill ${p}`}>{p}</span>}
                      {t.course && <span className={`tag c${courseSlot(t.course)}`}>{t.course}</span>}
                      <span>{t.type}</span>
                      <span>{dueLabel(t.due, today)}</span>
                    </div>
                  </div>
                  <button className="x" onClick={() => startEdit(t)} aria-label={`Edit ${t.title}`} title="Edit">✎</button>
                  <button className="x" onClick={() => hold([t], false)} aria-label={`Delete ${t.title}`} title="Delete">×</button>
                </div>
              );
            })}
            <datalist id="course-list">{courses.map((c) => <option key={c} value={c} />)}</datalist>
            <ReminderSetup onNeedLogin={() => setNeedLogin(true)} />
            {toast && <UndoToast message={toast} onUndo={undo} />}
          </>
        )}
      </FloatingPanel>
    </>
  );
}
