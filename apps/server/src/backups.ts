import { mkdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { backup, DatabaseSync } from 'node:sqlite';

export type BackupConfig = {
  directory: string;
  localTime: string;
  timezone: string;
  dailyRetention: number;
  weeklyRetention: number;
};

type LocalDateTime = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

type BackupRun = {
  scheduled_for: string;
  path: string;
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

const asInstant = (local: LocalDateTime, timezone: string): Date => {
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

const shiftDate = (
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

const dateText = (
  local: Pick<LocalDateTime, 'year' | 'month' | 'day'>,
): string =>
  [local.year, local.month, local.day]
    .map((part, index) =>
      index === 0 ? String(part) : String(part).padStart(2, '0'),
    )
    .join('-');

export const mostRecentBackupSlot = (
  now: Date,
  localTime: string,
  timezone: string,
): { scheduledFor: string; localDate: string } => {
  const [hourText, minuteText] = localTime.split(':');
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const localNow = partsFor(now, timezone);
  const hasPassed =
    localNow.hour > hour ||
    (localNow.hour === hour && localNow.minute >= minute);
  const date = shiftDate(localNow, hasPassed ? 0 : -1);
  const scheduledFor = asInstant({ ...date, hour, minute }, timezone);

  return {
    scheduledFor: scheduledFor.toISOString(),
    localDate: dateText(date),
  };
};

const isoWeek = (scheduledFor: string, timezone: string): string => {
  const local = partsFor(new Date(scheduledFor), timezone);
  const date = new Date(Date.UTC(local.year, local.month - 1, local.day));
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - weekday);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(
    ((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  );
  return `${date.getUTCFullYear()}-${String(week).padStart(2, '0')}`;
};

const completedBackups = (client: DatabaseSync): BackupRun[] =>
  client
    .prepare(
      `SELECT scheduled_for, path
       FROM backup_runs
       WHERE status = 'completed' AND removed_at IS NULL AND path IS NOT NULL
       ORDER BY scheduled_for DESC`,
    )
    .all() as BackupRun[];

export const pruneBackups = (
  client: DatabaseSync,
  config: BackupConfig,
  removedAt: string,
): void => {
  const runs = completedBackups(client);
  const daily = runs.slice(0, config.dailyRetention);
  const dailySlots = new Set(daily.map((run) => run.scheduled_for));
  const weeklySlots = new Set<string>();
  const weeklyKeys = new Set(
    daily.map((run) => isoWeek(run.scheduled_for, config.timezone)),
  );

  for (const run of runs.slice(config.dailyRetention)) {
    const week = isoWeek(run.scheduled_for, config.timezone);
    if (weeklyKeys.has(week)) continue;
    weeklyKeys.add(week);
    weeklySlots.add(run.scheduled_for);
    if (weeklySlots.size === config.weeklyRetention) break;
  }

  const markRemoved = client.prepare(
    'UPDATE backup_runs SET removed_at = ? WHERE scheduled_for = ?',
  );
  for (const run of runs) {
    if (
      dailySlots.has(run.scheduled_for) ||
      weeklySlots.has(run.scheduled_for)
    ) {
      continue;
    }
    rmSync(run.path, { force: true });
    markRemoved.run(removedAt, run.scheduled_for);
  }
};

const claimBackup = (
  client: DatabaseSync,
  scheduledFor: string,
  startedAt: string,
): boolean => {
  const staleBefore = new Date(
    new Date(startedAt).getTime() - 60 * 60 * 1_000,
  ).toISOString();
  const result = client
    .prepare(
      `INSERT INTO backup_runs (scheduled_for, status, started_at)
       VALUES (?, 'running', ?)
       ON CONFLICT(scheduled_for) DO UPDATE SET
         status = 'running', started_at = excluded.started_at,
         completed_at = NULL, path = NULL, size_bytes = NULL,
         error = NULL, removed_at = NULL
       WHERE backup_runs.status = 'failed'
          OR (backup_runs.status = 'running' AND backup_runs.started_at < ?)`,
    )
    .run(scheduledFor, startedAt, staleBefore);
  return result.changes === 1;
};

const verifyBackup = (path: string): void => {
  const snapshot = new DatabaseSync(path, { readOnly: true });
  try {
    const result = snapshot.prepare('PRAGMA quick_check').get() as
      | { quick_check: string }
      | undefined;
    if (result?.quick_check !== 'ok') {
      throw new Error('SQLite could not verify the completed snapshot.');
    }
  } finally {
    snapshot.close();
  }
};

export const runBackupIfDue = async (
  client: DatabaseSync,
  config: BackupConfig,
  now = new Date(),
): Promise<boolean> => {
  const slot = mostRecentBackupSlot(now, config.localTime, config.timezone);
  const startedAt = now.toISOString();
  if (!claimBackup(client, slot.scheduledFor, startedAt)) return false;

  mkdirSync(config.directory, { recursive: true });
  const path = join(config.directory, `mindfull-${slot.localDate}.sqlite`);
  const partialPath = `${path}.partial`;

  try {
    rmSync(partialPath, { force: true });
    await backup(client, partialPath);
    verifyBackup(partialPath);
    renameSync(partialPath, path);
    const completedAt = new Date().toISOString();
    const sizeBytes = statSync(path).size;
    client
      .prepare(
        `UPDATE backup_runs
         SET status = 'completed', completed_at = ?, path = ?,
             size_bytes = ?, error = NULL
         WHERE scheduled_for = ?`,
      )
      .run(completedAt, path, sizeBytes, slot.scheduledFor);
    pruneBackups(client, config, completedAt);
    return true;
  } catch (error) {
    rmSync(partialPath, { force: true });
    rmSync(path, { force: true });
    const message = error instanceof Error ? error.message : 'Backup failed.';
    client
      .prepare(
        `UPDATE backup_runs
         SET status = 'failed', completed_at = ?, error = ?
         WHERE scheduled_for = ?`,
      )
      .run(new Date().toISOString(), message, slot.scheduledFor);
    throw error;
  }
};

export const startBackupScheduler = (
  client: DatabaseSync,
  config: BackupConfig,
  onError: (error: unknown) => void,
) => {
  let activeRun: Promise<boolean> | null = null;
  const check = () => {
    if (activeRun) return;
    activeRun = runBackupIfDue(client, config)
      .catch((error) => {
        onError(error);
        return false;
      })
      .finally(() => {
        activeRun = null;
      });
  };
  const timer = setInterval(check, 60_000);
  timer.unref();
  check();

  return async () => {
    clearInterval(timer);
    await activeRun;
  };
};
