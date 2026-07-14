import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { drizzle } from 'drizzle-orm/node-sqlite';
import { migrate } from 'drizzle-orm/node-sqlite/migrator';

export const openDatabase = (
  databasePath: string,
  migrationsFolder: string,
) => {
  if (databasePath !== ':memory:') {
    mkdirSync(dirname(databasePath), { recursive: true });
  }

  const client = new DatabaseSync(databasePath, { timeout: 5_000 });
  client.exec('PRAGMA journal_mode = WAL;');
  client.exec('PRAGMA foreign_keys = ON;');

  const database = drizzle({ client });
  migrate(database, { migrationsFolder });

  return { client, database };
};

export type MindfullDatabase = ReturnType<typeof openDatabase>['database'];
