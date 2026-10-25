import { describe, expect, it } from 'vitest';
import { daysBetween } from '../lib/dates';
import { matchesFilter } from '../lib/filters';
import { detectDate, detectType, summarizeLocal } from '../lib/parse';
import { priorityOf, scoreTask } from '../lib/priority';
import { dueWindows, smsAddress } from '../lib/reminders';
import type { Task } from '../lib/types';

const T = (p: Partial<Task>): Task => ({
  id: '1', title: 't', details: '', type: 'assignment', due: null, done: false, createdAt: '', remindersSent: [], ...p,
});
const today = '2026-10-25';

describe('priority', () => {
  it('rises as the due date approaches', () => {
    const far = scoreTask({ type: 'exam', due: '2026-11-20' }, today);
    const near = scoreTask({ type: 'exam', due: '2026-10-28' }, today);
    const tomorrow = scoreTask({ type: 'exam', due: '2026-10-26' }, today);
    expect(near).toBeGreaterThan(far);
    expect(tomorrow).toBeGreaterThan(near);
  });
  it('weights exam/test/quiz above a plain assignment on the same date', () => {
    for (const type of ['exam', 'test', 'quiz'] as const)
      expect(scoreTask({ type, due: '2026-10-30' }, today)).toBeGreaterThan(scoreTask({ type: 'assignment', due: '2026-10-30' }, today));
  });
  it('assignment goes low -> medium -> high over time', () => {
    expect(priorityOf({ type: 'assignment', due: '2026-11-10' }, today)).toBe('low');
    expect(priorityOf({ type: 'assignment', due: '2026-10-27' }, today)).toBe('medium');
    expect(priorityOf({ type: 'assignment', due: '2026-10-25' }, today)).toBe('high');
  });
  it('overdue is high', () => {
    expect(priorityOf({ type: 'reading', due: '2026-10-20' }, today)).toBe('medium');
    expect(priorityOf({ type: 'assignment', due: '2026-10-20' }, today)).toBe('high');
  });
});

describe('parse', () => {
  it('detects types', () => {
    expect(detectType('Bio midterm next week')).toBe('exam');
    expect(detectType('pop quiz on ch 3')).toBe('quiz');
    expect(detectType('Study for chem')).toBe('study');
    expect(detectType('math homework 4.2')).toBe('assignment');
  });
  it('resolves relative dates forward', () => {
    const now = new Date('2026-10-25T12:00:00'); // Sunday
    expect(detectDate('exam on friday', now)).toBe('2026-10-30');
    expect(detectDate('nothing here', now)).toBeNull();
  });
  it('summarizes long text into a short title', () => {
    const s = summarizeLocal('Write a 5 page essay on the French Revolution. Use MLA format and cite five sources. Due Friday.', new Date('2026-10-25T12:00:00'));
    expect(s.title).toBe('Write a 5 page essay on the French Revolution');
    expect(s.due).toBe('2026-10-30');
  });
});

describe('filters', () => {
  it('splits by date and completion', () => {
    expect(matchesFilter(T({ due: '2026-10-26' }), 'tomorrow', today)).toBe(true);
    expect(matchesFilter(T({ due: '2026-10-20' }), 'overdue', today)).toBe(true);
    expect(matchesFilter(T({ done: true }), 'active', today)).toBe(false);
    expect(matchesFilter(T({ done: true }), 'completed', today)).toBe(true);
    expect(matchesFilter(T({ type: 'quiz' }), 'exams', today)).toBe(true);
  });
});

describe('reminders', () => {
  it('builds sms address', () => {
    expect(smsAddress({ phone: '(555) 123-4567', carrier: 'verizon' })).toBe('5551234567@vtext.com');
    expect(smsAddress({ phone: '123', carrier: 'verizon' })).toBeNull();
  });
  it('fires once per window', () => {
    const exam = T({ type: 'exam', due: '2026-10-28' });
    expect(dueWindows(exam, today)).toEqual(['3d']);
    expect(dueWindows({ ...exam, remindersSent: ['3d'] }, today)).toEqual([]);
    expect(dueWindows(T({ due: '2026-10-28' }), today)).toEqual([]);
    expect(dueWindows(T({ due: '2026-10-26' }), today)).toEqual(['1d']);
    expect(daysBetween(today, '2026-10-26')).toBe(1);
  });
});

import { dotsByDay, greeting, stats, weekDays } from '../lib/week';
import { matchesDate } from '../lib/filters';

describe('week', () => {
  it('lists seven days from today, crossing a month end', () => {
    const days = weekDays('2026-10-29');
    expect(days.map((d) => d.date)).toEqual(['2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04']);
    expect(days[0]).toMatchObject({ label: 'Thu', isToday: true });
  });
  it('puts one dot per open task on its day, colored by priority', () => {
    const days = weekDays(today);
    const dots = dotsByDay(
      [T({ type: 'exam', due: '2026-10-26' }), T({ due: '2026-10-26', done: true }), T({ due: '2026-11-30' })],
      days, today,
    );
    expect(dots['2026-10-26']).toEqual(['high']);
    expect(dots['2026-10-27']).toEqual([]);
  });
  it('counts due today and overdue, ignoring done tasks', () => {
    const s = stats([T({ due: today }), T({ due: '2026-10-20' }), T({ due: '2026-10-20', done: true }), T({ done: true })], today);
    expect(s).toEqual({ dueToday: 1, overdue: 1, doneRecently: 2 });
  });
  it('greets by hour and filters by date', () => {
    expect(greeting(8)).toBe('Good morning');
    expect(greeting(19)).toBe('Good evening');
    expect(matchesDate(T({ due: today }), today)).toBe(true);
    expect(matchesDate(T({ due: today, done: true }), today)).toBe(false);
  });
});

import { buildDigest } from '../lib/reminders';

describe('digest', () => {
  it('returns null when nothing is due', () => {
    expect(buildDigest([], today)).toBeNull();
  });
  it('groups by day, puts exams before assignments, and names the count', () => {
    const d = buildDigest(
      [T({ title: 'HW', due: '2026-10-26' }), T({ title: 'Chem quiz', type: 'quiz', due: '2026-10-26' }), T({ title: 'Essay', due: today }), T({ title: 'Exam', type: 'exam', due: '2026-10-28' })],
      today,
    )!;
    expect(d.subject).toBe('4 things due soon');
    expect(d.text.indexOf('Due today')).toBeLessThan(d.text.indexOf('Due tomorrow'));
    expect(d.text.indexOf('Due tomorrow')).toBeLessThan(d.text.indexOf('Coming up'));
    expect(d.text.indexOf('Chem quiz')).toBeLessThan(d.text.indexOf('HW'));
    expect(d.text).toContain('EXAM: Exam (Wed)');
  });
  it('uses singular wording and keeps the text short with "+N more"', () => {
    expect(buildDigest([T({ due: today })], today)!.subject).toBe('1 thing due soon');
    const many = Array.from({ length: 12 }, (_, i) => T({ title: `Assignment number ${i + 1}`, due: today }));
    const d = buildDigest(many, today)!;
    expect(d.sms.length).toBeLessThanOrEqual(160);
    expect(d.sms).toMatch(/\+\d+ more$/);
  });
});
