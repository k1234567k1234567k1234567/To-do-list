'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  currentGrade, letter, neededScore, partGrade, summary, weightTotal, weightWarning,
  type AwaitingItem, type GradeBook, type GradeClass, type Part,
} from '@/lib/grades';

const uid = () => Math.random().toString(36).slice(2, 10);
const r1 = (n: number) => Math.round(n * 10) / 10;
const JSON_HEADERS = { 'content-type': 'application/json' };

interface Draft { name: string; parts: { id: string; name: string; weight: string }[]; note: string }
const emptyDraft = (): Draft => ({ name: '', parts: [{ id: uid(), name: '', weight: '' }], note: '' });

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
    const parts = (d.parts as { name: string; weight: number }[]).map((p) => ({ id: uid(), name: p.name, weight: String(p.weight) }));
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
    const parts: Part[] = draft.parts.filter((p) => p.name.trim()).map((p) => ({ id: uid(), name: p.name.trim(), weight: p.weight === '' ? null : Number(p.weight), scores: [] }));
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
      body: JSON.stringify({ classId: entering.classId, partId: entering.partId, score: Number(entering.score) }),
    });
    if (res.ok) { setEntering(null); dirty.current = false; refresh(); } else setStatus('Could not log that score');
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
                          <input type="number" inputMode="decimal" min={0} max={100} placeholder="Score %" aria-label="Score percent" value={entering.score}
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
                <input placeholder="Class name, e.g. Bio" value={d.name} onChange={(e) => setD({ name: e.target.value })} aria-label="Class name" maxLength={40} />
                <textarea placeholder="Paste the grading section of your syllabus here (optional), then press Read syllabus." value={syllabus}
                  onChange={(e) => setSyllabus(e.target.value)} aria-label="Syllabus text" />
                <button className="btn ghost" onClick={readSyllabus} disabled={reading || !syllabus.trim()}>{reading ? 'Reading…' : 'Read syllabus'}</button>
                {d.note && <div className="muted">{d.note}</div>}
                <div className="parts-edit">
                  {d.parts.map((p, i) => (
                    <div key={p.id} className="prow">
                      <input placeholder="Part, e.g. Midterm" value={p.name} aria-label="Part name" maxLength={40}
                        onChange={(e) => setD({ parts: d.parts.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
                      <input type="number" inputMode="decimal" placeholder="%" value={p.weight} aria-label="Weight percent" min={0} max={100}
                        onChange={(e) => setD({ parts: d.parts.map((x, j) => (j === i ? { ...x, weight: e.target.value } : x)) })} />
                      <button className="x" onClick={() => setD({ parts: d.parts.filter((_, j) => j !== i) })} aria-label="Remove part">×</button>
                    </div>
                  ))}
                </div>
                <div className="row">
                  <button className="btn ghost" onClick={() => setD({ parts: [...d.parts, { id: uid(), name: '', weight: '' }] })}>Add part</button>
                  <span className={Math.abs(sum - 100) < 0.01 ? 'good' : 'muted'}>Weights total {r1(sum)}%</span>
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
              {warn && <div className="muted">{warn}</div>}
              <div className="plist">
                {view.parts.map((p) => {
                  const g = partGrade(p);
                  return (
                    <div key={p.id} className="pcard">
                      <div className="prow">
                        <input value={p.name} aria-label="Part name" maxLength={40} onChange={(e) => setPart(p.id, { name: e.target.value })} />
                        <input type="number" inputMode="decimal" placeholder="Set %" value={p.weight ?? ''} aria-label={`${p.name} weight percent`} min={0} max={100}
                          onChange={(e) => setPart(p.id, { weight: e.target.value === '' ? null : Number(e.target.value) })} />
                        <button className="x" onClick={() => edit((c) => ({ ...c, parts: c.parts.filter((x) => x.id !== p.id) }))} aria-label={`Remove ${p.name}`}>×</button>
                      </div>
                      <div className="scores">
                        {p.scores.map((s, i) => (
                          <button key={i} className="schip" onClick={() => setPart(p.id, { scores: p.scores.filter((_, j) => j !== i) })} title="Remove this score">{r1(s)} ×</button>
                        ))}
                        <input type="number" inputMode="decimal" className="snew" placeholder="+ score %" min={0} max={100} aria-label={`Add score to ${p.name}`}
                          value={newScore[p.id] ?? ''} onChange={(e) => setNewScore({ ...newScore, [p.id]: e.target.value })}
                          onKeyDown={(e) => {
                            const v = Number(newScore[p.id]);
                            if (e.key === 'Enter' && newScore[p.id] !== '' && newScore[p.id] !== undefined && Number.isFinite(v)) {
                              setPart(p.id, { scores: [...p.scores, Math.min(100, Math.max(0, v))] });
                              setNewScore({ ...newScore, [p.id]: '' });
                            }
                          }} />
                        <span className="muted">{g === null ? 'not graded yet' : `avg ${r1(g)}%`}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="row">
                <button className="btn ghost" onClick={() => edit((c) => ({ ...c, parts: [...c.parts, { id: uid(), name: 'New part', weight: null, scores: [] }] }))}>Add part</button>
                {!whatIf && cls && <button className="btn ghost" onClick={() => setWhatIf(structuredClone(cls))}>What-if</button>}
                {!whatIf && <button className="btn ghost danger" onClick={removeClass}>Delete class</button>}
                <span className="muted">{status}</span>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
