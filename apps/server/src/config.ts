import { resolve } from 'node:path';

export type ServerConfig = {
  host: string;
  port: number;
  databasePath: string;
  migrationsFolder: string;
  pairingCode: string;
  webRoot: string | null;
  backup: {
    directory: string;
    localTime: string;
    timezone: string;
    dailyRetention: number;
    weeklyRetention: number;
  } | null;
};

const positiveInteger = (
  value: string | undefined,
  fallback: number,
): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const backupsEnabled = process.env.BACKUP_ENABLED !== 'false';

export const readServerConfig = (): ServerConfig => ({
  host: process.env.HOST ?? '0.0.0.0',
  port: Number.parseInt(process.env.PORT ?? '3001', 10),
  databasePath: resolve(process.env.DATABASE_PATH ?? './data/mindfull.sqlite'),
  migrationsFolder: resolve(process.env.MIGRATIONS_DIR ?? './drizzle'),
  pairingCode: process.env.MINDFULL_PAIRING_CODE ?? 'mindfull-local',
  webRoot: process.env.WEB_ROOT ? resolve(process.env.WEB_ROOT) : null,
  backup: backupsEnabled
    ? {
        directory: resolve(process.env.BACKUP_DIRECTORY ?? './data/backups'),
        localTime: process.env.BACKUP_LOCAL_TIME ?? '03:00',
        timezone: process.env.MINDFULL_TIMEZONE ?? 'UTC',
        dailyRetention: positiveInteger(process.env.BACKUP_DAILY_RETENTION, 7),
        weeklyRetention: positiveInteger(
          process.env.BACKUP_WEEKLY_RETENTION,
          4,
        ),
      }
    : null,
});
