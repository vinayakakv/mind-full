import { describe, expect, it } from 'vitest';

import { ambientPhaseFor, ambientSceneFor } from './ambient-scene';

const localDate = (
  year: number,
  month: number,
  day: number,
  hour = 12,
  minute = 0,
) => new Date(year, month - 1, day, hour, minute);

describe('ambient scene', () => {
  it.each([
    [4, 59, 'night'],
    [5, 0, 'dawn'],
    [8, 59, 'dawn'],
    [9, 0, 'day'],
    [16, 59, 'day'],
    [17, 0, 'dusk'],
    [20, 59, 'dusk'],
    [21, 0, 'night'],
  ] as const)('uses the local hour for the %s:%s atmosphere', (hour, minute, phase) => {
    expect(ambientPhaseFor(localDate(2026, 7, 20, hour, minute))).toBe(phase);
  });

  it('keeps one harmony throughout the local calendar week', () => {
    const monday = ambientSceneFor(localDate(2026, 7, 20));
    const sunday = ambientSceneFor(localDate(2026, 7, 26));

    expect(monday.harmony).toBe(sunday.harmony);
    expect(monday.composition).toBe(0);
    expect(sunday.composition).toBe(6);
  });

  it('moves to the next curated harmony on Monday', () => {
    const current = ambientSceneFor(localDate(2026, 7, 20));
    const following = ambientSceneFor(localDate(2026, 7, 27));

    expect(following.harmony).toBe((current.harmony + 1) % 6);
  });
});
