import type { ReminderPayload } from './documents.js';

export const reminderIdFor = (
  targetType: ReminderPayload['targetType'],
  targetId: string,
): string => `reminder:${targetType}:${targetId}`;

type LocalDateTime = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

const partsFor = (date: Date, timezone: string): LocalDateTime => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const numberPart = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value);

  return {
    year: numberPart('year'),
    month: numberPart('month'),
    day: numberPart('day'),
    hour: numberPart('hour'),
    minute: numberPart('minute'),
  };
};

const localDateTimeAsInstant = (
  local: LocalDateTime,
  timezone: string,
): Date => {
  const desiredTimestamp = Date.UTC(
    local.year,
    local.month - 1,
    local.day,
    local.hour,
    local.minute,
  );
  let candidate = new Date(desiredTimestamp);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const represented = partsFor(candidate, timezone);
    const representedTimestamp = Date.UTC(
      represented.year,
      represented.month - 1,
      represented.day,
      represented.hour,
      represented.minute,
    );
    candidate = new Date(
      candidate.getTime() + desiredTimestamp - representedTimestamp,
    );
  }

  return candidate;
};

const datePlusDays = (
  local: Pick<LocalDateTime, 'year' | 'month' | 'day'>,
  days: number,
) => {
  const date = new Date(
    Date.UTC(local.year, local.month - 1, local.day + days),
  );
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
};

export const nextReminderAt = (
  reminder: ReminderPayload,
  after: Date,
  timezone: string,
): string | null => {
  if (!reminder.enabled) return null;

  if (reminder.scheduledAt) {
    return reminder.scheduledAt > after.toISOString()
      ? reminder.scheduledAt
      : null;
  }

  if (!reminder.localTime || !reminder.weekdays) return null;

  const [hourText, minuteText] = reminder.localTime.split(':');
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const localAfter = partsFor(after, timezone);

  for (let offset = 0; offset <= 7; offset += 1) {
    const localDate = datePlusDays(localAfter, offset);
    const weekday = new Date(
      Date.UTC(localDate.year, localDate.month - 1, localDate.day),
    ).getUTCDay();

    if (!reminder.weekdays.includes(weekday)) continue;

    const candidate = localDateTimeAsInstant(
      { ...localDate, hour, minute },
      timezone,
    );

    if (candidate > after) return candidate.toISOString();
  }

  return null;
};
