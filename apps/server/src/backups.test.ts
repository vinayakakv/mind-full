import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';

import {
  type BackupConfig,
  mostRecentBackupSlot,
  pruneBackups,
  runBackupIfDue,
} from './backups.js';
import { openDatabase } from './database/database.js';

const temporaryDirectories: string[] = [];

const temporaryDirectory = (): string => {
  const directory = mkdtempSync(join(tmpdir(), 'mindfull-backup-'));
  temporaryDirectories.push(directory);
  return directory;
};

const configFor = (directory: string): BackupConfig => ({
  directory: join(directory, 'backups'),
  localTime: '03:00',
  timezone: 'Asia/Kolkata',
  dailyRetention: 7,
  weeklyRetention: 4,
});

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('SQLite backups', () => {
  it('selects the latest elapsed daily slot in the configured timezone', () => {
    expect(
      mostRecentBackupSlot(
        new Date('2026-07-17T00:00:00.000Z'),
        '03:00',
        'Asia/Kolkata',
      ),
    ).toEqual({
      scheduledFor: '2026-07-16T21:30:00.000Z',
      localDate: '2026-07-17',
    });

    expect(
      mostRecentBackupSlot(
        new Date('2026-07-16T20:00:00.000Z'),
        '03:00',
        'Asia/Kolkata',
      ),
    ).toEqual({
      scheduledFor: '2026-07-15T21:30:00.000Z',
      localDate: '2026-07-16',
    });
  });

  it('creates and verifies one restart-safe snapshot for a due slot', async () => {
    const directory = temporaryDirectory();
    const backupDirectory = join(directory, 'backups');
    mkdirSync(backupDirectory, { recursive: true });
    writeFileSync(
      join(backupDirectory, 'mindfull-2026-07-16.sqlite.partial-wal'),
      '',
    );
    writeFileSync(
      join(backupDirectory, 'mindfull-2026-07-16.sqlite.partial-shm'),
      '',
    );
    const { client } = openDatabase(
      join(directory, 'mindfull.sqlite'),
      resolve('drizzle'),
    );
    client
      .prepare(
        `INSERT INTO devices (id, name, token_hash, created_at)
         VALUES (?, ?, ?, ?)`,
      )
      .run('phone', 'Phone', 'hash', '2026-07-17T00:00:00.000Z');

    const firstRun = await runBackupIfDue(
      client,
      configFor(directory),
      new Date('2026-07-17T00:00:00.000Z'),
    );
    const secondRun = await runBackupIfDue(
      client,
      configFor(directory),
      new Date('2026-07-17T01:00:00.000Z'),
    );

    expect(firstRun).toBe(true);
    expect(secondRun).toBe(false);
    const path = join(directory, 'backups', 'mindfull-2026-07-17.sqlite');
    expect(existsSync(path)).toBe(true);
    expect(readdirSync(backupDirectory)).toEqual([
      'mindfull-2026-07-17.sqlite',
    ]);

    const snapshot = new DatabaseSync(path, { readOnly: true });
    expect(snapshot.prepare('SELECT name FROM devices').get()).toEqual({
      name: 'Phone',
    });
    snapshot.close();
    expect(
      client
        .prepare(
          `SELECT status, path, size_bytes > 0 AS has_size
           FROM backup_runs`,
        )
        .get(),
    ).toEqual({ status: 'completed', path, has_size: 1 });
    client.close();
  });

  it('keeps seven recent daily snapshots and four older weekly snapshots', () => {
    const directory = temporaryDirectory();
    const { client } = openDatabase(
      join(directory, 'mindfull.sqlite'),
      resolve('drizzle'),
    );
    const config = configFor(directory);
    mkdirSync(config.directory, { recursive: true });
    const insert = client.prepare(
      `INSERT INTO backup_runs
       (scheduled_for, status, started_at, completed_at, path, size_bytes)
       VALUES (?, 'completed', ?, ?, ?, 1)`,
    );

    for (let day = 0; day < 42; day += 1) {
      const date = new Date(Date.UTC(2026, 6, 17 - day, 0));
      const scheduledFor = date.toISOString();
      const path = join(config.directory, `snapshot-${day}.sqlite`);
      writeFileSync(path, 'snapshot', { flag: 'wx' });
      insert.run(scheduledFor, scheduledFor, scheduledFor, path);
    }

    pruneBackups(client, config, '2026-07-17T01:00:00.000Z');

    const retained = client
      .prepare(
        `SELECT path FROM backup_runs
         WHERE status = 'completed' AND removed_at IS NULL`,
      )
      .all() as Array<{ path: string }>;
    const removed = client
      .prepare('SELECT path FROM backup_runs WHERE removed_at IS NOT NULL')
      .all() as Array<{ path: string }>;

    expect(retained).toHaveLength(11);
    expect(retained.every(({ path }) => existsSync(path))).toBe(true);
    expect(removed.every(({ path }) => !existsSync(path))).toBe(true);
    client.close();
  });
});
