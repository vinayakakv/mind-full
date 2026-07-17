import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import fastifyStatic from '@fastify/static';
import { parseDomainDocument } from '@mindfull/domain';
import Fastify from 'fastify';
import { z } from 'zod';

import { authenticatedDeviceId, matchesSecret, pairDevice } from './auth.js';
import { startBackupScheduler } from './backups.js';
import type { ServerConfig } from './config.js';
import { openDatabase } from './database/database.js';
import { synchronizeDocuments } from './database/documents.js';

const pairRequestSchema = z.object({
  pairingCode: z.string().min(1),
  deviceId: z.string().min(1),
  deviceName: z.string().trim().min(1).max(80),
});

const syncRequestSchema = z.object({
  cursor: z.number().int().nonnegative(),
  documents: z.array(z.unknown()).max(500),
});

export type BuildServerOptions = Pick<
  ServerConfig,
  'databasePath' | 'migrationsFolder' | 'pairingCode' | 'webRoot' | 'backup'
> & {
  logger?: boolean;
};

export const buildServer = async ({
  databasePath,
  migrationsFolder,
  pairingCode,
  webRoot,
  backup,
  logger = false,
}: BuildServerOptions) => {
  const server = Fastify({ logger });
  const { client, database } = openDatabase(databasePath, migrationsFolder);

  const stopBackupScheduler = backup
    ? startBackupScheduler(client, backup, (error) => {
        server.log.error({ error }, 'SQLite backup failed');
      })
    : async () => {};

  server.addHook('onClose', async () => {
    await stopBackupScheduler();
    client.close();
  });

  server.get('/api/health', async () => ({
    status: 'ok',
    services: { core: 'available', ai: 'not-configured' },
  }));

  server.post('/api/pair', async (request, reply) => {
    const parsedRequest = pairRequestSchema.safeParse(request.body);

    if (!parsedRequest.success) {
      return reply.code(400).send({ error: 'Invalid pairing request.' });
    }

    if (!matchesSecret(parsedRequest.data.pairingCode, pairingCode)) {
      return reply.code(401).send({ error: 'Pairing code was not accepted.' });
    }

    const token = pairDevice(
      database,
      parsedRequest.data.deviceId,
      parsedRequest.data.deviceName,
    );

    return reply.send({ token });
  });

  server.post('/api/sync', async (request, reply) => {
    const deviceId = authenticatedDeviceId(database, request);

    if (!deviceId) {
      return reply
        .code(401)
        .send({ error: 'Pair this device to synchronize.' });
    }

    const parsedRequest = syncRequestSchema.safeParse(request.body);

    if (!parsedRequest.success) {
      return reply
        .code(400)
        .send({ error: 'Invalid synchronization request.' });
    }

    try {
      const incomingDocuments =
        parsedRequest.data.documents.map(parseDomainDocument);

      if (
        incomingDocuments.some(
          (document) => document.updatedByDeviceId !== deviceId,
        )
      ) {
        return reply
          .code(403)
          .send({ error: 'A device may only push its own document versions.' });
      }

      return reply.send(
        synchronizeDocuments(
          database,
          parsedRequest.data.cursor,
          incomingDocuments,
        ),
      );
    } catch {
      return reply
        .code(400)
        .send({ error: 'A document could not be accepted.' });
    }
  });

  if (webRoot && existsSync(resolve(webRoot, 'index.html'))) {
    await server.register(fastifyStatic, {
      root: webRoot,
      prefix: '/',
      wildcard: false,
    });

    server.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/')) {
        return reply.code(404).send({ error: 'Not found.' });
      }

      return reply.sendFile('index.html');
    });
  }

  return server;
};
