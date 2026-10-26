'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  currentGrade, formatScore, isAttendanceName, itemCount, letter, mergeParts, neededScore, parseScore, partGrade, perItem, splitPart,
  summary, toScore, weightTotal, weightWarning,
  type AwaitingItem, type GradeBook, type GradeClass, type Part,
} from '@/lib/grades';

const uid = () => Math.random().toString(36).slice(2, 10);
const r1 = (n: number) => Math.round(n * 10) / 10;
const JSON_HEADERS = { 'content-type': 'application/json' };

interface DraftPart { id: string; name: string; weight: string; count: string }
interface Draft { name: string; parts: DraftPart[]; note: string }
const emptyDraft = (): Draft => ({ name: '', parts: [], note: '' });
const CHIPS = ['Tests', 'Quizzes', 'Homework', 'Projects', 'Midterm', 'Final', 'Attendance', 'Participation'];
const numOrNull = (v: string) => (v === '' ? null : Math.max(0, Number(v) || 0));

export default function Grades() {
  const [book, setBook] = useState<GradeBook>({ classes: [] });
  const [awaiting, setAwaiting] = useState<AwaitingItem[]>([]);
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState('');
  const [whatIf, setWhatIf] = useState<GradeClass | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [syllabus, setSyllabus] = useState('');
  const [reading, setReading] = useState(false);
  const [entering, setEntering] = useState<{ id: string; classId: string; partId: string; score: string } | null>(null);
  const [newScore, setNewScore] = useState<Record<string, string>>({});
  const [newLabel, setNewLabel] = useState<Record<string, string>>({});
  const [scoreErr, setScoreErr] = useState<Record<string, string>>({});
  const [drag, setDrag] = useState<{ id: string; name: string; x: number; y: number; over: string | null } | null>(null);
  const [status, setStatus] = useState('');
  const [ready, setReady] = useState(false);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(book);
  latest.current = book;

  const refresh = useCallback(async () => {
    const [g, a] = await Promise.all([fetch('/api/kv/grades'), fetch('/api/awaiting')]).catch(() => [null, null] as const);
    if (g?.ok && !dirty.current) { setBook((await g.json()).value as GradeBook); setReady(true); }
    if (a?.ok) setAwaiting(await a.json());
  }, []);

  useEffect(() => {
    refresh();
    const again = () => refresh();
    window.addEventListener('focus', again);
    window.addEventListener('todo:changed', again);
    const id = setInterval(again, 60_000);
    return () => { window.removeEventListener('focus', again); window.removeEventListener('todo:changed', again); clearInterval(id); };
  }, [refresh]);

  const saveNow = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    if (!dirty.current) return;
    setStatus('Saving…');
    try {
      const res = await fetch('/api/kv/grades', { method: 'PUT', headers: JSON_HEADERS, body: JSON.stringify({ value: latest.current }) });
      if (res.ok) { dirty.current = false; setStatus('Saved'); } else setStatus('Not saved');
    } catch { setStatus('Not saved'); }
  }, []);

  const changeBook = (next: GradeBook) => {
    dirty.current = true;
    setBook(next);
    latest.current = next;
    setStatus('');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(saveNow, 800);
  };

  // First visit: open straight into the new-class form.
  useEffect(() => {
    if (open && ready && book.classes.length === 0 && !draft) setDraft(emptyDraft());
  }, [open, ready, book.classes.length, draft]);

  const cls = book.classes.find((c) => c.id === sel) ?? book.classes[0] ?? null;
  const view = whatIf ?? cls;

  /** Edit the class being shown: a scratch copy in what-if mode, the real one otherwise. */
  const edit = (fn: (c: GradeClass) => GradeClass) => {
    if (!view) return;
    if (whatIf) setWhatIf(fn(whatIf));
    else changeBook({ classes: book.classes.map((c) => (c.id === view.id ? fn(c) : c)) });
  };
  const setPart = (id: string, patch: Partial<Part>) => edit((c) => ({ ...c, parts: c.parts.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));

  /** Make "a & b": a keeps its place, b is removed. */
  const combine = (aId: string, bId: string) => edit((c) => {
    const a = c.parts.find((x) => x.id === aId);
    const b = c.parts.find((x) => x.id === bId);
    const m = a && b ? mergeParts(a, b) : null;
    return m ? { ...c, parts: c.parts.filter((x) => x.id !== bId).map((x) => (x.id === aId ? m : x)) } : c;
  });
  const split = (id: string) => edit((c) => ({ ...c, parts: c.parts.flatMap((x) => (x.id === id ? splitPart(x, uid) : [x])) }));
  const combineRef = useRef(combine);
  combineRef.current = combine;

  const overAt = (x: number, y: number, self: string): string | null => {
    const el = document.elementFromPoint(x, y)?.closest('[data-part-id]');
    const id = el?.getAttribute('data-part-id') ?? null;
    return id && id !== self && el?.getAttribute('data-mergeable') === '1' ? id : null;
  };

  /** Press and hold a category's grip, then drop it on another category to combine them. */
  const startPress = (e: React.PointerEvent, p: Part) => {
    if (e.button !== 0 || p.kind === 'attendance') return;
    const sx = e.clientX;
    const sy = e.clientY;
    let x = sx;
    let y = sy;
    const state = { active: false, over: null as string | null };
    const timer = setTimeout(() => {
      state.active = true;
      document.body.classList.add('dragging');
      setDrag({ id: p.id, name: p.name, x, y, over: null });
    }, 400);
    const finish = (doMerge: boolean) => {
      clearTimeout(timer);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', abort);
      window.removeEventListener('keydown', key);
      document.body.classList.remove('dragging');
      setDrag(null);
      if (doMerge && state.over) combineRef.current(state.over, p.id);
    };
    const move = (ev: PointerEvent) => {
      x = ev.clientX; y = ev.clientY;
      if (state.active) {
        state.over = overAt(x, y, p.id);
        setDrag({ id: p.id, name: p.name, x, y, over: state.over });
      } else if (Math.hypot(x - sx, y - sy) > 10) finish(false); // moved before the hold finished: not a drag
    };
    const up = () => finish(true);
    const abort = () => finish(false);
    const key = (ev: KeyboardEvent) => { if (ev.key === 'Escape') finish(false); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', abort);
    window.addEventListener('keydown', key);
  };

  const addPartScore = (p: Part) => {
    const text = newScore[p.id] ?? '';
    if (!text.trim()) return;
    const parsed = parseScore(text);
    if (!parsed) { setScoreErr({ ...scoreErr, [p.id]: 'Use 86 or 43/50' }); return; }
    const label = p.members && p.members.length > 1 ? newLabel[p.id] ?? p.members[0] : undefined;
    setPart(p.id, { scores: [...p.scores, toScore(parsed, label)] });
    setNewScore({ ...newScore, [p.id]: '' });
    setScoreErr({ ...scoreErr, [p.id]: '' });
  };

  const grade = view ? currentGrade(view.parts) : null;
  const need = view ? neededScore(view.parts, view.target) : null;
  const warn = view ? weightWarning(view.parts) : null;
  const line = useMemo(() => book.classes.map(summary).join(' · '), [book]);

  const readSyllabus = async () => {
    setReading(true);
    const res = await fetch('/api/grades/parse', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ text: syllabus }) });
    const d = await res.json().catch(() => ({}));
    setReading(false);
    if (!res.ok) return setDraft((x) => ({ ...(x ?? emptyDraft()), note: d.error || 'Could not read that.' }));
    const parts = (d.parts as { name: string; weight: number; count?: number }[]).map((p) => ({ id: uid(), name: p.name, weight: String(p.weight), count: p.count ? String(p.count) : '' }));
    setDraft((x) => ({
      name: x?.name || d.name || '',
      parts: parts.length ? parts : x?.parts ?? [],
      note: parts.length
        ? `${d.source === 'ai' ? 'Read by AI' : 'Read by simple rules'}. Check every weight against your syllabus before saving.`
        : 'Found no percentages. Add the parts by hand.',
    }));
  };

  const createClass = () => {
    if (!draft || !draft.name.trim()) return;
    const parts: Part[] = draft.parts.filter((p) => p.name.trim()).map((p) => {
      const base = { id: uid(), name: p.name.trim(), weight: p.weight === '' ? null : Number(p.weight), scores: [] as Part['scores'] };
      return isAttendanceName(p.name)
        ? { ...base, kind: 'attendance' as const, lates: 0, absences: 0, lateCost: null, absenceCost: null, participation: null }
        : { ...base, count: p.count === '' ? null : Math.min(50, Math.max(1, Math.round(Number(p.count)))) };
    });
    const c: GradeClass = { id: uid(), name: draft.name.trim(), target: 90, parts };
    changeBook({ classes: [...book.classes, c] });
    setSel(c.id); setDraft(null); setSyllabus('');
  };

  const removeClass = () => {
    if (!cls) return;
    changeBook({ classes: book.classes.filter((c) => c.id !== cls.id) });
    setSel(''); setWhatIf(null);
  };

  const startEntering = (a: AwaitingItem) => {
    const match = book.classes.find((c) => a.course && c.name.toLowerCase() === a.course.toLowerCase()) ?? book.classes[0];
    setEntering({ id: a.id, classId: match?.id ?? '', partId: match?.parts[0]?.id ?? '', score: '' });
  };
  const submitScore = async () => {
    if (!entering || !entering.classId || !entering.partId || entering.score === '') return;
    await saveNow(); // the server adds to the saved gradebook, so save pending edits first
    const res = await fetch(`/api/awaiting/${entering.id}`, {
      method: 'POST', headers: JSON_HEADERS,
      body: JSON.stringify({ classId: entering.classId, partId: entering.partId, score: entering.score }),
    });
    if (res.ok) { setEntering(null); dirty.current = false; refresh(); } else setStatus(((await res.json().catch(() => ({}))) as { error?: string }).error ?? 'Could not log that score');
  };
  const skip = async (id: string) => {
    await fetch(`/api/awaiting/${id}`, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ dismiss: true }) });
    setEntering(null); refresh();
  };

  const eClass = entering ? book.classes.find((c) => c.id === entering.classId) : null;

  return (
    <section className="card grades" aria-label="Grades">
      <div className="card-head">
        <h2>Grades{awaiting.length > 0 && <span className="count" title="Finished tasks waiting for a grade">{awaiting.length} waiting</span>}</h2>
        <button className="btn ghost small" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? 'Collapse' : 'Open'}</button>
      </div>

      {!open && <div className="muted">{line || 'Add a class to track your grade and see what you need on the final.'}</div>}

      {open && (
        <>
          {awaiting.length > 0 && (
            <div className="await">
              <strong>Waiting on grades</strong>
              {awaiting.map((a) => (
                <div key={a.id} className="await-row">
                  <div className="await-title">{a.title}{a.course ? <span className="muted"> · {a.course}</span> : null}</div>
                  {entering?.id === a.id ? (
                    <div className="enter">
                      {book.classes.length === 0 ? <span className="muted">Add a class below first.</span> : (
                        <>
                          <select value={entering.classId} aria-label="Class" onChange={(e) => {
                            const c = book.classes.find((x) => x.id === e.target.value);
                            setEntering({ ...entering, classId: e.target.value, partId: c?.parts[0]?.id ?? '' });
                          }}>{book.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
                          <select value={entering.partId} aria-label="Which part" onChange={(e) => setEntering({ ...entering, partId: e.target.value })}>
                            {(eClass?.parts ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                          <input inputMode="decimal" placeholder="86 or 43/50" aria-label="Score" value={entering.score}
                            onChange={(e) => setEntering({ ...entering, score: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && submitScore()} />
                          <button className="btn" onClick={submitScore} disabled={!entering.partId || entering.score === ''}>Save score</button>
                        </>
                      )}
                      <button className="btn ghost" onClick={() => setEntering(null)}>Cancel</button>
                    </div>
                  ) : (
                    <div className="row">
                      <button className="btn" onClick={() => startEntering(a)}>Enter score</button>
                      <button className="btn ghost" onClick={() => skip(a.id)} title="No grade for this one">No grade</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {book.classes.length > 0 && !draft && (
            <div className="row">
              <select value={cls?.id ?? ''} onChange={(e) => { setSel(e.target.value); setWhatIf(null); }} aria-label="Class">
                {book.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button className="btn ghost" onClick={() => setDraft(emptyDraft())}>Add class</button>
            </div>
          )}

          {draft && (() => {
            const d = draft;
            const setD = (patch: Partial<Draft>) => setDraft({ ...d, ...patch });
            const sum = d.parts.reduce((a, p) => a + (Number(p.weight) || 0), 0);
            return (
              <div className="newclass">
                <strong>New class</strong>
                <input placeholder="Class name, e.g. Bio" value={d.name} onChange={(e) => setD({ name: e.target.value })} aria-label="Class name" maxLength={60} />
                <textarea placeholder="Paste the grading section of your syllabus here (optional), then press Read syllabus." value={syllabus}
                  onChange={(e) => setSyllabus(e.target.value)} aria-label="Syllabus text" />
                <button className="btn ghost" onClick={readSyllabus} disabled={reading || !syllabus.trim()}>{reading ? 'Reading…' : 'Read syllabus'}</button>
                {d.note && <div className="muted">{d.note}</div>}
                {book.classes.length > 0 && (
                  <select aria-label="Start from another class" value="" onChange={(e) => {
                    const src = book.classes.find((c) => c.id === e.target.value);
                    if (src) setD({ parts: src.parts.map((x) => ({ id: uid(), name: x.name, weight: x.weight === null ? '' : String(x.weight), count: x.count ? String(x.count) : '' })) });
                  }}>
                    <option value="">Start from another class…</option>
                    {book.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                )}
                <div className="chips" aria-label="Quick add a category">
                  {CHIPS.map((c) => (
                    <button key={c} className="chip" onClick={() => setD({ parts: [...d.parts, { id: uid(), name: c, weight: '', count: '' }] })}>+ {c}</button>
                  ))}
                </div>
                {d.parts.length > 0 && (
                  <div className="parts-edit">
                    <div className="prow phead"><span>Category</span><span>Total %</span><span># items</span><span /></div>
                    {d.parts.map((p, i) => (
                      <div key={p.id} className="prow">
                        <input placeholder="e.g. Tests" value={p.name} aria-label="Category name" maxLength={60}
                          onChange={(e) => setD({ parts: d.parts.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
                        <input type="number" inputMode="decimal" placeholder="%" value={p.weight} aria-label="Total weight percent" min={0} max={100}
                          onChange={(e) => setD({ parts: d.parts.map((x, j) => (j === i ? { ...x, weight: e.target.value } : x)) })} />
                        <input type="number" inputMode="numeric" placeholder="?" value={p.count} aria-label="Number of items" min={1} max={50}
                          title="How many are there this semester? Check the syllabus or ask your teacher. Leave blank if you don't know."
                          onChange={(e) => setD({ parts: d.parts.map((x, j) => (j === i ? { ...x, count: e.target.value } : x)) })} />
                        <button className="x" onClick={() => setD({ parts: d.parts.filter((_, j) => j !== i) })} aria-label="Remove category">×</button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="row">
                  <button className="btn ghost" onClick={() => setD({ parts: [...d.parts, { id: uid(), name: '', weight: '', count: '' }] })}>Add category</button>
                  <span className={Math.abs(sum - 100) < 0.01 ? 'good' : 'muted'}>Weights total {r1(sum)}%{sum < 100 && sum > 0 ? ` (${r1(100 - sum)}% left)` : ''}</span>
                </div>
                <div className="row">
                  <button className="btn" onClick={createClass} disabled={!d.name.trim()}>Save class</button>
                  {book.classes.length > 0 && <button className="btn ghost" onClick={() => setDraft(null)}>Cancel</button>}
                </div>
              </div>
            );
          })()}

          {view && !draft && (
            <div className="classview">
              {whatIf && (
                <div className="whatif-banner" role="status">
                  What-if mode. Changes here are not saved.
                  <span>
                    <button onClick={() => cls && setWhatIf(structuredClone(cls))}>Reset</button>
                    <button onClick={() => setWhatIf(null)}>Exit</button>
                  </span>
                </div>
              )}
              <div className="gline">
                <b>{grade === null ? '–' : `${r1(grade)}%`}</b>
                <span>{grade === null ? 'No scores yet' : letter(grade)}</span>
                <label className="target">Target
                  <input type="number" inputMode="decimal" min={0} max={100} value={view.target} aria-label="Target grade percent"
                    onChange={(e) => edit((c) => ({ ...c, target: Math.min(100, Math.max(0, Number(e.target.value) || 0)) }))} />
                </label>
              </div>
              {need && (
                <div className="need">
                  {need.status === 'none' && (weightTotal(view.parts) ? 'Nothing left to grade.' : 'Set a weight for each part to see your grade.')}
                  {need.status === 'secured' && `Your target of ${view.target}% is already secured.`}
                  {need.status === 'unreachable' && `Reaching ${view.target}% would need ${need.score}% on the rest, which is not possible.`}
                  {need.status === 'needed' && `You need about ${need.score}% on the remaining ${r1(need.remaining)}% to finish at ${view.target}%.${need.approximate ? ' (Approximate, weights do not add to 100%.)' : ''}`}
                </div>
              )}
              {need?.status === 'needed' && need.assumed && (
                <div className="muted">Some categories have no item count, so their scores so far are treated as the whole category.</div>
              )}
              {need?.status === 'needed' && need.attendance && <div className="muted">Attendance assumes no further unexcused lates or absences.</div>}
              {warn && <div className="muted">{warn}</div>}
              <div className="plist">
                {view.parts.length > 0 && <div className="prow g phead"><span /><span>Category</span><span>Total %</span><span># items</span><span /></div>}
                {view.parts.map((p) => {
                  const g = partGrade(p);
                  const each = perItem(p);
                  const att = p.kind === 'attendance';
                  const members = p.members ?? [];
                  const merged = members.length > 1;
                  const others = view.parts.filter((x) => x.id !== p.id && x.kind !== 'attendance');
                  return (
                    <div key={p.id} data-part-id={p.id} data-mergeable={att ? '0' : '1'}
                      className={`pcard${drag?.over === p.id ? ' over' : ''}${drag?.id === p.id ? ' dragging' : ''}`}>
                      <div className="prow g">
                        <button className="grip" disabled={att} aria-label={`Hold and drag ${p.name} onto another category to combine them`}
                          title={att ? 'Attendance cannot be combined' : 'Hold, then drag onto another category to combine them'}
                          onPointerDown={(e) => startPress(e, p)}>⋮⋮</button>
                        <input value={p.name} aria-label="Part name" maxLength={60} onChange={(e) => setPart(p.id, { name: e.target.value })} />
                        <input type="number" inputMode="decimal" placeholder="Set %" value={p.weight ?? ''} aria-label={`${p.name} weight percent`} min={0} max={100}
                          onChange={(e) => setPart(p.id, { weight: e.target.value === '' ? null : Number(e.target.value) })} />
                        {att ? <span /> : (
                          <input type="number" inputMode="numeric" placeholder="?" value={p.count ?? ''} aria-label={`${p.name} number of items`} min={1} max={50}
                            title="How many are there this semester? Check the syllabus or ask your teacher. Leave blank if you don't know."
                            onChange={(e) => setPart(p.id, { count: e.target.value === '' ? null : Math.min(50, Math.max(1, Math.round(Number(e.target.value)))) })} />
                        )}
                        <button className="x" onClick={() => edit((c) => ({ ...c, parts: c.parts.filter((x) => x.id !== p.id) }))} aria-label={`Remove ${p.name}`}>×</button>
                      </div>

                      {merged && (
                        <div className="members">
                          {members.map((m) => <span key={m} className="mchip">{m}</span>)}
                          <button className="linkish" onClick={() => split(p.id)}>Split</button>
                        </div>
                      )}

                      {att ? (
                        <div className="att">
                          {([['lates', 'lateCost', 'Unexcused lates'], ['absences', 'absenceCost', 'Unexcused absences']] as const).map(([k, ck, label]) => (
                            <div key={k} className="counter">
                              <span>{label}</span>
                              <button onClick={() => setPart(p.id, { [k]: Math.max(0, (p[k] ?? 0) - 1) })} aria-label={`Fewer ${label.toLowerCase()}`}>−</button>
                              <b aria-label={`${label} count`}>{p[k] ?? 0}</b>
                              <button onClick={() => setPart(p.id, { [k]: (p[k] ?? 0) + 1 })} aria-label={`More ${label.toLowerCase()}`}>+</button>
                              <label className="cost">each costs
                                <input type="number" inputMode="decimal" min={0} max={100} placeholder="?" value={p[ck] ?? ''} aria-label={`${label} cost percent`}
                                  onChange={(e) => setPart(p.id, { [ck]: numOrNull(e.target.value) })} />% of attendance</label>
                            </div>
                          ))}
                          <label className="cost">Participation score (optional)
                            <input type="number" inputMode="decimal" min={0} max={100} placeholder="%" value={p.participation ?? ''} aria-label="Participation score"
                              onChange={(e) => setPart(p.id, { participation: numOrNull(e.target.value) })} />
                          </label>
                          <div className="muted">Attendance now: {g === null ? '–' : `${r1(g)}%`}. Excused ones are not counted.</div>
                        </div>
                      ) : (
                        <>
                          <div className="scores">
                            {p.scores.map((sc, i) => (
                              <button key={i} className="schip" onClick={() => setPart(p.id, { scores: p.scores.filter((_, j) => j !== i) })} title="Remove this score">
                                {typeof sc === 'object' && sc.label ? `${sc.label} ` : ''}{formatScore(sc)} ×
                              </button>
                            ))}
                            {merged && (
                              <select className="slabel" aria-label={`Which part of ${p.name}`} value={newLabel[p.id] ?? members[0]}
                                onChange={(e) => setNewLabel({ ...newLabel, [p.id]: e.target.value })}>
                                {members.map((m) => <option key={m} value={m}>{m}</option>)}
                              </select>
                            )}
                            <input className="snew" inputMode="decimal" placeholder="86 or 43/50" aria-label={`Add score to ${p.name}`}
                              value={newScore[p.id] ?? ''} onChange={(e) => setNewScore({ ...newScore, [p.id]: e.target.value })}
                              onKeyDown={(e) => { if (e.key === 'Enter') addPartScore(p); }} />
                            <span className="muted">{g === null ? 'not graded yet' : `avg ${r1(g)}%`}</span>
                          </div>
                          {scoreErr[p.id] && <div className="err">{scoreErr[p.id]}</div>}
                          {p.count ? (
                            <div className="muted">{p.scores.length} of {itemCount(p)} graded{each !== null ? ` · each ≈ ${r1(each)}%` : ''}</div>
                          ) : p.scores.length > 0 ? (
                            <div className="muted">No item count set, so these scores count as the whole category.</div>
                          ) : null}
                        </>
                      )}

                      {!att && others.length > 0 && (
                        <select className="combine" value="" aria-label={`Combine ${p.name} with another category`}
                          onChange={(e) => e.target.value && combine(p.id, e.target.value)}>
                          <option value="">Combine with…</option>
                          {others.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                        </select>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="row">
                <button className="btn ghost" onClick={() => edit((c) => ({ ...c, parts: [...c.parts, { id: uid(), name: 'New part', weight: null, scores: [] }] }))}>Add part</button>
                {!view.parts.some((x) => x.kind === 'attendance') && (
                  <button className="btn ghost" onClick={() => edit((c) => ({ ...c, parts: [...c.parts, { id: uid(), name: 'Attendance', weight: null, kind: 'attendance', lates: 0, absences: 0, lateCost: null, absenceCost: null, participation: null, scores: [] }] }))}>Add attendance</button>
                )}
                {!whatIf && cls && <button className="btn ghost" onClick={() => setWhatIf(structuredClone(cls))}>What-if</button>}
                {!whatIf && <button className="btn ghost danger" onClick={removeClass}>Delete class</button>}
                <span className="muted">{status}</span>
              </div>
            </div>
          )}
        </>
      )}
      {drag && (
        <div className="dragghost" style={{ left: drag.x + 14, top: drag.y + 14 }}>
          {drag.name}{drag.over ? ` → combine with ${view?.parts.find((x) => x.id === drag.over)?.name ?? ''}` : ''}
        </div>
      )}
    </section>
  );
}
