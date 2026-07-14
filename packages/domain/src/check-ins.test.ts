import { describe, expect, it } from 'vitest';

import {
  isCheckInScheduleValid,
  relevantCheckInKind,
  selectCuratedPrompts,
} from './check-ins.js';

describe('check-in prompts', () => {
  it('keeps prompt selection stable for a local date', () => {
    expect(selectCuratedPrompts('morning', '2026-07-14')).toEqual(
      selectCuratedPrompts('morning', '2026-07-14'),
    );
  });

  it('rotates wording while preserving the shape of each flow', () => {
    const firstMorning = selectCuratedPrompts('morning', '2026-07-14');
    const nextMorning = selectCuratedPrompts('morning', '2026-07-15');
    const evening = selectCuratedPrompts('evening', '2026-07-14');

    expect(firstMorning.map(({ intention }) => intention)).toEqual([
      'appreciate',
      'acknowledge',
      'focus',
    ]);
    expect(nextMorning.map(({ id }) => id)).not.toEqual(
      firstMorning.map(({ id }) => id),
    );
    expect(evening.map(({ intention }) => intention)).toEqual([
      'appreciate',
      'acknowledge',
      'release',
      'focus',
    ]);
  });
});

describe('relevant check-in', () => {
  it('uses the configured morning and evening boundaries', () => {
    expect(relevantCheckInKind('04:59', '05:00', '18:00')).toBe('evening');
    expect(relevantCheckInKind('05:00', '05:00', '18:00')).toBe('morning');
    expect(relevantCheckInKind('17:59', '05:00', '18:00')).toBe('morning');
    expect(relevantCheckInKind('18:00', '05:00', '18:00')).toBe('evening');
  });

  it('requires a morning boundary before the evening boundary', () => {
    expect(isCheckInScheduleValid('05:00', '18:00')).toBe(true);
    expect(isCheckInScheduleValid('18:00', '05:00')).toBe(false);
    expect(isCheckInScheduleValid('09:00', '09:00')).toBe(false);
  });
});
