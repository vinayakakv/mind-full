import type { HabitLogPayload, HabitPayload } from './documents.js';

type HabitSchedule = Pick<HabitPayload, 'weekdays'> &
  Partial<Pick<HabitPayload, 'schedules'>>;

export type HabitOccurrenceStatus =
  | 'completed'
  | 'missed'
  | 'open'
  | 'unscheduled';

export type HabitWeek = {
  weekStart: string;
  weekEnd: string;
  completed: number;
  scheduled: number;
  percentage: number;
  isPartial: boolean;
};

export const habitIdForSuggestion = (suggestionId: string): string =>
  `habit:from-suggestion:${suggestionId}`;

export const shiftLocalDate = (
  localDate: string,
  dayOffset: number,
): string => {
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

const sameWeekdays = (left: number[], right: number[]): boolean =>
  [...left].sort().join(',') === [...right].sort().join(',');

export const scheduleForHabitDate = (
  habit: HabitSchedule,
  localDate: string,
): number[] => {
  const schedules = [...(habit.schedules ?? [])]
    .filter(({ effectiveFrom }) => effectiveFrom <= localDate)
    .sort((left, right) =>
      left.effectiveFrom.localeCompare(right.effectiveFrom),
    );

  return schedules.at(-1)?.weekdays ?? habit.weekdays;
};

export const habitScheduledOn = (
  habit: HabitSchedule,
  localDate: string,
  startedOn: string,
): boolean =>
  localDate >= startedOn &&
  scheduledOn(scheduleForHabitDate(habit, localDate), localDate);

export const withHabitSchedule = (
  habit: HabitSchedule,
  weekdays: number[],
  effectiveFrom: string,
  startedOn: string,
): HabitPayload['schedules'] => {
  const existing = habit.schedules ?? [];
  if (sameWeekdays(habit.weekdays, weekdays)) return existing;

  const schedules =
    existing.length > 0
      ? existing
      : [{ effectiveFrom: startedOn, weekdays: [...habit.weekdays].sort() }];
  const withoutEffectiveDate = schedules.filter(
    (schedule) => schedule.effectiveFrom !== effectiveFrom,
  );

  return [
    ...withoutEffectiveDate,
    { effectiveFrom, weekdays: [...weekdays].sort() },
  ].sort((left, right) =>
    left.effectiveFrom.localeCompare(right.effectiveFrom),
  );
};

export const habitLogIdFor = (habitId: string, localDate: string): string =>
  `habit-log:${habitId}:${localDate}`;

export const recentCalendarDates = (today: string, count: number): string[] =>
  Array.from({ length: count }, (_, index) =>
    shiftLocalDate(today, index - count + 1),
  );

export const canCorrectHabitDate = (
  today: string,
  localDate: string,
): boolean => localDate <= today && localDate >= shiftLocalDate(today, -6);

export const habitOccurrenceStatus = (
  habit: HabitSchedule,
  logs: HabitLogPayload[],
  localDate: string,
  today: string,
  startedOn: string,
): HabitOccurrenceStatus => {
  if (!habitScheduledOn(habit, localDate, startedOn)) return 'unscheduled';

  const outcome = logs.find((log) => log.localDate === localDate)?.outcome;
  if (outcome === 'completed') return 'completed';
  if (localDate === today) return 'open';
  return 'missed';
};

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

export const recentHabitScheduledDates = (
  habit: HabitSchedule,
  beforeOrOn: string,
  startedOn: string,
  count: number,
): string[] => {
  const dates: string[] = [];
  let cursor = beforeOrOn;

  while (cursor >= startedOn && dates.length < count) {
    if (habitScheduledOn(habit, cursor, startedOn)) dates.push(cursor);
    cursor = shiftLocalDate(cursor, -1);
  }

  return dates;
};

export const habitStreak = (
  habit: HabitSchedule,
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
    if (!habitScheduledOn(habit, cursor, startedOn)) {
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

export const habitCompletionCount = (
  habit: HabitSchedule,
  logs: HabitLogPayload[],
  today: string,
  startedOn: string,
  calendarDays: number,
): { completed: number; scheduled: number } => {
  const outcomes = new Map(
    logs.map(({ localDate, outcome }) => [localDate, outcome]),
  );
  const dates = recentCalendarDates(today, calendarDays).filter((localDate) =>
    habitScheduledOn(habit, localDate, startedOn),
  );

  return {
    completed: dates.filter(
      (localDate) => outcomes.get(localDate) === 'completed',
    ).length,
    scheduled: dates.length,
  };
};

const mondayOnOrBefore = (localDate: string): string => {
  const weekday = weekdayForLocalDate(localDate);
  return shiftLocalDate(localDate, -(weekday === 0 ? 6 : weekday - 1));
};

export const habitWeeks = (
  habit: HabitSchedule,
  logs: HabitLogPayload[],
  today: string,
  startedOn: string,
  count: number,
): HabitWeek[] => {
  const outcomes = new Map(
    logs.map(({ localDate, outcome }) => [localDate, outcome]),
  );
  const currentWeekStart = mondayOnOrBefore(today);

  return Array.from({ length: count }, (_, index) => {
    const weekStart = shiftLocalDate(currentWeekStart, (index - count + 1) * 7);
    const naturalWeekEnd = shiftLocalDate(weekStart, 6);
    const weekEnd = naturalWeekEnd > today ? today : naturalWeekEnd;
    const dates = Array.from({ length: 7 }, (__, dayIndex) =>
      shiftLocalDate(weekStart, dayIndex),
    ).filter(
      (localDate) =>
        localDate <= weekEnd && habitScheduledOn(habit, localDate, startedOn),
    );
    const completed = dates.filter(
      (localDate) => outcomes.get(localDate) === 'completed',
    ).length;

    return {
      weekStart,
      weekEnd,
      completed,
      scheduled: dates.length,
      percentage:
        dates.length === 0 ? 0 : Math.round((completed / dates.length) * 100),
      isPartial: naturalWeekEnd > today,
    };
  });
};
