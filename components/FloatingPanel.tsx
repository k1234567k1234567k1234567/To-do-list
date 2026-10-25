'use client';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

interface Props {
  title: string;
  badge?: number;
  children: ReactNode;
}

const KEY = 'todo-panel';
const MARGIN = 8;

/** Draggable, minimizable window. Position and minimized state persist in localStorage. */
export default function FloatingPanel({ title, badge, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [min, setMin] = useState(false);
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  const clamp = useCallback((x: number, y: number) => {
    const w = ref.current?.offsetWidth ?? 360;
    const h = ref.current?.offsetHeight ?? 60;
    return {
      x: Math.min(Math.max(MARGIN, x), Math.max(MARGIN, window.innerWidth - w - MARGIN)),
      y: Math.min(Math.max(MARGIN, y), Math.max(MARGIN, window.innerHeight - h - MARGIN)),
    };
  }, []);

  useEffect(() => {
    let saved: { x: number; y: number; min: boolean } | null = null;
    try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch {}
    setMin(!!saved?.min);
    setPos(clamp(saved?.x ?? window.innerWidth - 376, saved?.y ?? 16));
    const onResize = () => setPos((p) => (p ? clamp(p.x, p.y) : p));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [clamp]);

  useEffect(() => {
    if (!pos) return;
    try { localStorage.setItem(KEY, JSON.stringify({ ...pos, min })); } catch {}
  }, [pos, min]);

  // Re-clamp after the size changes (minimize/expand) so the panel never ends up off-screen.
  useEffect(() => { setPos((p) => (p ? clamp(p.x, p.y) : p)); }, [min, clamp]);

  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button') || !pos) return;
    drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (drag.current) setPos(clamp(e.clientX - drag.current.dx, e.clientY - drag.current.dy));
  };
  const onUp = () => { drag.current = null; };

  return (
    <div
      ref={ref}
      className={`panel${min ? ' min' : ''}`}
      style={{ left: pos?.x ?? -9999, top: pos?.y ?? 0, visibility: pos ? 'visible' : 'hidden' }}
      role="dialog"
      aria-label={title}
    >
      <div className="panel-head" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        onDoubleClick={() => setMin((m) => !m)}>
        <h2>{title}</h2>
        {min && badge ? <span className="badge" title="Due soon">{badge}</span> : null}
        <button onClick={() => setMin((m) => !m)} aria-label={min ? 'Expand' : 'Minimize'}>{min ? '▢' : '–'}</button>
      </div>
      {!min && <div className="panel-body">{children}</div>}
    </div>
  );
}
