import type { HabitLogPayload, HabitPayload } from './documents.js';

export const habitIdForSuggestion = (suggestionId: string): string =>
  `habit:from-suggestion:${suggestionId}`;

const shiftLocalDate = (localDate: string, dayOffset: number): string => {
  const [year, month, day] = localDate.split('-').map(Number);
  const shifted = new Date(
    Date.UTC(year ?? 0, (month ?? 1) - 1, (day ?? 1) + dayOffset),
  );
  return shifted.toISOString().slice(0, 10);
};

export const weekdayForLocalDate = (localDate: string): number => {
  const [year, month, day] = localDate.split('-').map(Number);
  return new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1)).getUTCDay();
};

export const scheduledOn = (
  weekdays: HabitPayload['weekdays'],
  localDate: string,
): boolean => weekdays.includes(weekdayForLocalDate(localDate));

export const habitLogIdFor = (habitId: string, localDate: string): string =>
  `habit-log:${habitId}:${localDate}`;

export const recentScheduledDates = (
  weekdays: HabitPayload['weekdays'],
  beforeOrOn: string,
  startedOn: string,
  count: number,
): string[] => {
  const dates: string[] = [];
  let cursor = beforeOrOn;

  while (cursor >= startedOn && dates.length < count) {
    if (scheduledOn(weekdays, cursor)) dates.push(cursor);
    cursor = shiftLocalDate(cursor, -1);
  }

  return dates;
};

export const habitStreak = (
  habit: Pick<HabitPayload, 'weekdays'>,
  logs: HabitLogPayload[],
  today: string,
  startedOn: string,
): number => {
  const outcomes = new Map(
    logs.map(({ localDate, outcome }) => [localDate, outcome]),
  );
  let streak = 0;
  let cursor = today;

  while (cursor >= startedOn) {
    if (!scheduledOn(habit.weekdays, cursor)) {
      cursor = shiftLocalDate(cursor, -1);
      continue;
    }

    const outcome = outcomes.get(cursor);

    if (cursor === today && outcome === undefined) {
      cursor = shiftLocalDate(cursor, -1);
      continue;
    }
    if (outcome !== 'completed') break;
    streak += 1;
    cursor = shiftLocalDate(cursor, -1);
  }

  return streak;
};
