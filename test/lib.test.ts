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
