import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { neon } from '@neondatabase/serverless';
import { DEFAULT_SETTINGS, type Settings, type Task } from './types';

/**
 * Storage: Postgres (Neon / Vercel Postgres) when DATABASE_URL is set,
 * otherwise a JSON file in .data/ for local development.
 */
export interface Store {
  list(): Promise<Task[]>;
  create(t: Omit<Task, 'id' | 'createdAt' | 'done' | 'remindersSent'>): Promise<Task>;
  update(id: string, patch: Partial<Task>): Promise<Task | null>;
  remove(id: string): Promise<void>;
  clearCompleted(): Promise<number>;
  getSettings(): Promise<Settings>;
  saveSettings(s: Settings): Promise<void>;
  /** Small named values (notes, completion history). */
  getKV<T>(key: string, fallback: T): Promise<T>;
  setKV(key: string, value: unknown): Promise<void>;
}

function newTask(t: Omit<Task, 'id' | 'createdAt' | 'done' | 'remindersSent'>): Task {
  return { ...t, id: randomUUID(), createdAt: new Date().toISOString(), done: false, remindersSent: [] };
}

function fileStore(): Store {
  const file = path.join(process.cwd(), '.data', 'db.json');
  type Data = { tasks: Task[]; settings: Settings; kv?: Record<string, unknown> };
  const read = async (): Promise<Data> => {
    try {
      return JSON.parse(await fs.readFile(file, 'utf8'));
    } catch {
      return { tasks: [], settings: DEFAULT_SETTINGS };
    }
  };
  const write = async (d: Data) => {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(d, null, 2));
  };
  return {
    async list() { return (await read()).tasks; },
    async create(t) {
      const d = await read(); const task = newTask(t);
      d.tasks.push(task); await write(d); return task;
    },
    async update(id, patch) {
      const d = await read(); const i = d.tasks.findIndex((x) => x.id === id);
      if (i < 0) return null;
      d.tasks[i] = { ...d.tasks[i], ...patch, id }; await write(d); return d.tasks[i];
    },
    async remove(id) { const d = await read(); d.tasks = d.tasks.filter((x) => x.id !== id); await write(d); },
    async clearCompleted() {
      const d = await read(); const n = d.tasks.filter((x) => x.done).length;
      d.tasks = d.tasks.filter((x) => !x.done); await write(d); return n;
    },
    async getSettings() { return { ...DEFAULT_SETTINGS, ...(await read()).settings }; },
    async saveSettings(s) { const d = await read(); d.settings = s; await write(d); },
    async getKV<T>(key: string, fallback: T) { const v = (await read()).kv?.[key]; return (v === undefined ? fallback : v) as T; },
    async setKV(key, value) { const d = await read(); d.kv = { ...d.kv, [key]: value }; await write(d); },
  };
}

function pgStore(url: string): Store {
  const sql = neon(url);
  let ready: Promise<unknown> | null = null;
  const init = () =>
    (ready ??= Promise.all([
      sql`CREATE TABLE IF NOT EXISTS tasks (id text PRIMARY KEY, data jsonb NOT NULL)`,
      sql`CREATE TABLE IF NOT EXISTS settings (id int PRIMARY KEY, data jsonb NOT NULL)`,
      sql`CREATE TABLE IF NOT EXISTS kv (k text PRIMARY KEY, v jsonb NOT NULL)`,
    ]));
  return {
    async list() {
      await init();
      const rows = await sql`SELECT data FROM tasks`;
      return rows.map((r) => r.data as Task);
    },
    async create(t) {
      await init(); const task = newTask(t);
      await sql`INSERT INTO tasks (id, data) VALUES (${task.id}, ${JSON.stringify(task)}::jsonb)`;
      return task;
    },
    async update(id, patch) {
      await init();
      const rows = await sql`SELECT data FROM tasks WHERE id = ${id}`;
      if (!rows.length) return null;
      const next = { ...(rows[0].data as Task), ...patch, id };
      await sql`UPDATE tasks SET data = ${JSON.stringify(next)}::jsonb WHERE id = ${id}`;
      return next;
    },
    async remove(id) { await init(); await sql`DELETE FROM tasks WHERE id = ${id}`; },
    async clearCompleted() {
      await init();
      const rows = await sql`DELETE FROM tasks WHERE (data->>'done')::boolean RETURNING id`;
      return rows.length;
    },
    async getSettings() {
      await init();
      const rows = await sql`SELECT data FROM settings WHERE id = 1`;
      return { ...DEFAULT_SETTINGS, ...((rows[0]?.data as Settings) ?? {}) };
    },
    async saveSettings(s) {
      await init();
      await sql`INSERT INTO settings (id, data) VALUES (1, ${JSON.stringify(s)}::jsonb)
                ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`;
    },
    async getKV<T>(key: string, fallback: T) {
      await init();
      const rows = await sql`SELECT v FROM kv WHERE k = ${key}`;
      return (rows.length ? rows[0].v : fallback) as T;
    },
    async setKV(key, value) {
      await init();
      await sql`INSERT INTO kv (k, v) VALUES (${key}, ${JSON.stringify(value)}::jsonb)
                ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v`;
    },
  };
}

let store: Store | null = null;
export function getStore(): Store {
  return (store ??= process.env.DATABASE_URL ? pgStore(process.env.DATABASE_URL) : fileStore());
}
