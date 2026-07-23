export type AmbientPhase = 'dawn' | 'day' | 'dusk' | 'night';

export type AmbientScene = {
  composition: number;
  harmony: number;
  phase: AmbientPhase;
};

const millisecondsPerDay = 86_400_000;
const millisecondsPerWeek = millisecondsPerDay * 7;
const harmonyCount = 6;
const harmonyReferenceMonday = Date.UTC(2026, 0, 5);

const positiveModulo = (value: number, divisor: number) =>
  ((value % divisor) + divisor) % divisor;

export const ambientPhaseFor = (date: Date): AmbientPhase => {
  const hour = date.getHours();

  if (hour >= 5 && hour < 9) return 'dawn';
  if (hour >= 9 && hour < 17) return 'day';
  if (hour >= 17 && hour < 21) return 'dusk';
  return 'night';
};

const localDateAtUtcMidnight = (date: Date) =>
  Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());

const mondayIndexFor = (date: Date) => (date.getDay() + 6) % 7;

export const ambientSceneFor = (date: Date): AmbientScene => {
  const composition = mondayIndexFor(date);
  const monday =
    localDateAtUtcMidnight(date) - composition * millisecondsPerDay;
  const weeksSinceReference = Math.round(
    (monday - harmonyReferenceMonday) / millisecondsPerWeek,
  );

  return {
    composition,
    harmony: positiveModulo(weeksSinceReference, harmonyCount),
    phase: ambientPhaseFor(date),
  };
};
