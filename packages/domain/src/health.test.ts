import { describe, expect, it } from 'vitest';

import { createBodyMeasurementDocument } from './documents.js';
import {
  changeFromPreviousMeasurement,
  displayedBodyValue,
  measurementsInHealthRange,
  toCanonicalBodyValue,
  unitsForBodyMetric,
} from './health.js';

const measurement = (id: string, occurredAt: string, value: number) =>
  createBodyMeasurementDocument({
    id,
    now: occurredAt,
    deviceId: 'test-device',
    occurredAt,
    payload: { metricId: 'body-metric:weight', value },
  });

describe('body units', () => {
  it('stores pounds and inches canonically', () => {
    expect(toCanonicalBodyValue(220.46, 'lb')).toBeCloseTo(100, 2);
    expect(toCanonicalBodyValue(40, 'in')).toBe(101.6);
    expect(displayedBodyValue(100, 'lb')).toBe(220.46);
  });

  it('offers only units that match the metric kind', () => {
    expect(unitsForBodyMetric('mass')).toEqual(['kg', 'lb']);
    expect(unitsForBodyMetric('circumference')).toEqual(['cm', 'in']);
  });
});

describe('body measurement trends', () => {
  const older = measurement('older', '2026-04-14T12:00:00.000Z', 80);
  const previous = measurement('previous', '2026-06-20T12:00:00.000Z', 79);
  const latest = measurement('latest', '2026-07-14T12:00:00.000Z', 78.5);

  it('filters and orders a selected range', () => {
    expect(
      measurementsInHealthRange(
        [latest, older, previous],
        new Date('2026-07-15T12:00:00.000Z'),
        '1m',
      ).map(({ id }) => id),
    ).toEqual(['previous', 'latest']);
  });

  it('keeps end-of-month ranges within the intended month', () => {
    const february = measurement('february', '2026-02-28T12:00:00.000Z', 79.5);

    expect(
      measurementsInHealthRange(
        [february],
        new Date('2026-03-31T12:00:00.000Z'),
        '1m',
      ),
    ).toEqual([february]);
  });

  it('calculates an absolute change from the previous reading', () => {
    expect(
      changeFromPreviousMeasurement([previous, latest], 'body-metric:weight'),
    ).toBe(-0.5);
    expect(
      changeFromPreviousMeasurement([latest], 'body-metric:weight'),
    ).toBeNull();
  });
});
