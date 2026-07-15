import type {
  BodyMeasurementDocument,
  BodyMetricPayload,
} from './documents.js';

export type BodyMetricKind = BodyMetricPayload['kind'];
export type BodyUnit = BodyMetricPayload['preferredUnit'];
export type HealthRange = '1m' | '3m' | '6m' | '1y' | 'all';

export type DefaultBodyMetric = {
  id: string;
  name: string;
  kind: BodyMetricKind;
  preferredUnit: BodyUnit;
};

export const defaultBodyMetrics: DefaultBodyMetric[] = [
  {
    id: 'body-metric:weight',
    name: 'Weight',
    kind: 'mass',
    preferredUnit: 'kg',
  },
  {
    id: 'body-metric:waist',
    name: 'Waist',
    kind: 'circumference',
    preferredUnit: 'cm',
  },
  {
    id: 'body-metric:belly',
    name: 'Belly',
    kind: 'circumference',
    preferredUnit: 'cm',
  },
  {
    id: 'body-metric:hips',
    name: 'Hips',
    kind: 'circumference',
    preferredUnit: 'cm',
  },
  {
    id: 'body-metric:chest',
    name: 'Chest',
    kind: 'circumference',
    preferredUnit: 'cm',
  },
  {
    id: 'body-metric:upper-arm',
    name: 'Upper arm',
    kind: 'circumference',
    preferredUnit: 'cm',
  },
  {
    id: 'body-metric:thigh',
    name: 'Thigh',
    kind: 'circumference',
    preferredUnit: 'cm',
  },
];

const poundsToKilograms = 0.45359237;
const inchesToCentimetres = 2.54;

const roundedCanonicalValue = (value: number): number =>
  Math.round(value * 1_000_000) / 1_000_000;

export const unitsForBodyMetric = (kind: BodyMetricKind): BodyUnit[] =>
  kind === 'mass' ? ['kg', 'lb'] : ['cm', 'in'];

export const toCanonicalBodyValue = (value: number, unit: BodyUnit): number => {
  if (unit === 'lb') return roundedCanonicalValue(value * poundsToKilograms);
  if (unit === 'in') return roundedCanonicalValue(value * inchesToCentimetres);
  return roundedCanonicalValue(value);
};

export const fromCanonicalBodyValue = (
  value: number,
  unit: BodyUnit,
): number => {
  if (unit === 'lb') return value / poundsToKilograms;
  if (unit === 'in') return value / inchesToCentimetres;
  return value;
};

export const displayedBodyValue = (value: number, unit: BodyUnit): number =>
  Math.round(fromCanonicalBodyValue(value, unit) * 100) / 100;

export const formatBodyValue = (value: number, unit: BodyUnit): string =>
  `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(
    displayedBodyValue(value, unit),
  )} ${unit}`;

const rangeStart = (now: Date, range: Exclude<HealthRange, 'all'>): number => {
  const start = new Date(now);
  const originalDay = start.getUTCDate();
  start.setUTCDate(1);
  if (range === '1y') start.setUTCFullYear(start.getUTCFullYear() - 1);
  else start.setUTCMonth(start.getUTCMonth() - Number.parseInt(range, 10));
  const lastDayOfTargetMonth = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0),
  ).getUTCDate();
  start.setUTCDate(Math.min(originalDay, lastDayOfTargetMonth));
  return start.getTime();
};

export const measurementsInHealthRange = (
  measurements: BodyMeasurementDocument[],
  now: Date,
  range: HealthRange,
): BodyMeasurementDocument[] => {
  const start =
    range === 'all' ? Number.NEGATIVE_INFINITY : rangeStart(now, range);
  const end = now.getTime();

  return measurements
    .filter(({ deletedAt, occurredAt }) => {
      if (deletedAt || !occurredAt) return false;
      const recordedAt = new Date(occurredAt).getTime();
      return recordedAt >= start && recordedAt <= end;
    })
    .sort((left, right) =>
      (left.occurredAt ?? '').localeCompare(right.occurredAt ?? ''),
    );
};

export const latestBodyMeasurements = (
  measurements: BodyMeasurementDocument[],
  metricId?: string,
): BodyMeasurementDocument[] =>
  measurements
    .filter(
      ({ deletedAt, payload }) =>
        !deletedAt && (!metricId || payload.metricId === metricId),
    )
    .sort((left, right) =>
      (right.occurredAt ?? '').localeCompare(left.occurredAt ?? ''),
    );

export const changeFromPreviousMeasurement = (
  measurements: BodyMeasurementDocument[],
  metricId: string,
): number | null => {
  const [latest, previous] = latestBodyMeasurements(measurements, metricId);
  return latest && previous
    ? latest.payload.value - previous.payload.value
    : null;
};
