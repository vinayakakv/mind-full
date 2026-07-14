import { resolve } from 'node:path';

export type ServerConfig = {
  host: string;
  port: number;
  databasePath: string;
  migrationsFolder: string;
  pairingCode: string;
  webRoot: string | null;
};

export const readServerConfig = (): ServerConfig => ({
  host: process.env.HOST ?? '0.0.0.0',
  port: Number.parseInt(process.env.PORT ?? '3001', 10),
  databasePath: resolve(process.env.DATABASE_PATH ?? './data/mindfull.sqlite'),
  migrationsFolder: resolve(process.env.MIGRATIONS_DIR ?? './drizzle'),
  pairingCode: process.env.MINDFULL_PAIRING_CODE ?? 'mindfull-local',
  webRoot: process.env.WEB_ROOT ? resolve(process.env.WEB_ROOT) : null,
});
