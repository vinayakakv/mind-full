import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import fastifyStatic from '@fastify/static';
import { parseDomainDocument } from '@mindfull/domain';
import { eq } from 'drizzle-orm';
import Fastify from 'fastify';
import { z } from 'zod';

import type { AiInvoker } from './ai/provider.js';
import { loadProviderModels, normalizeProviderBaseUrl } from './ai/provider.js';
import {
  failedJobCount,
  historicalSources,
  pendingJobCount,
  queueInitialMemory,
  readAiConfiguration,
  reconcileReflectionJobs,
  reflectionMemoryId,
  retryFailedJobs,
  saveAiConfiguration,
  setAiPaused,
} from './ai/store.js';
import { startAiWorker } from './ai/worker.js';
import { authenticatedDeviceId, matchesSecret, pairDevice } from './auth.js';
import { startBackupScheduler } from './backups.js';
import type { ServerConfig } from './config.js';
import { openDatabase } from './database/database.js';
import {
  findDocument,
  storeDocument,
  synchronizeDocuments,
} from './database/documents.js';
import { aiJobs, aiMemoryBuilds } from './database/schema.js';

const pairRequestSchema = z.object({
  pairingCode: z.string().min(1),
  deviceId: z.string().min(1),
  deviceName: z.string().trim().min(1).max(80),
});

const syncRequestSchema = z.object({
  cursor: z.number().int().nonnegative(),
  documents: z.array(z.unknown()).max(500),
});

const providerModelsSchema = z.object({
  baseUrl: z.string().min(1).max(2_000),
  apiKey: z.string().max(2_000).nullable(),
});

const aiConfigurationSchema = z.object({
  baseUrl: z.string().min(1).max(2_000),
  apiKey: z.string().max(2_000).nullable(),
  model: z.string().min(1).max(200).nullable(),
});

export type BuildServerOptions = Pick<
  ServerConfig,
  'databasePath' | 'migrationsFolder' | 'pairingCode' | 'webRoot' | 'backup'
> & {
  logger?: boolean;
  aiInvoker?: AiInvoker;
  aiModelLoader?: typeof loadProviderModels;
};

export const buildServer = async ({
  databasePath,
  migrationsFolder,
  pairingCode,
  webRoot,
  backup,
  logger = false,
  aiInvoker,
  aiModelLoader,
}: BuildServerOptions) => {
  const server = Fastify({ logger });
  const { client, database } = openDatabase(databasePath, migrationsFolder);
  const aiWorker = startAiWorker(database, {
    ...(aiInvoker ? { invoker: aiInvoker } : {}),
    ...(aiModelLoader ? { modelLoader: aiModelLoader } : {}),
    onError: () => server.log.warn('AI work is waiting'),
  });

  const stopBackupScheduler = backup
    ? startBackupScheduler(client, backup, (error) => {
        server.log.error({ error }, 'SQLite backup failed');
      })
    : async () => {};

  server.addHook('onClose', async () => {
    await aiWorker.stop();
    await stopBackupScheduler();
    client.close();
  });

  server.get('/api/health', async () => ({
    status: 'ok',
    services: {
      core: 'available',
      ai: readAiConfiguration(database)?.status ?? 'not-configured',
    },
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

      const result = synchronizeDocuments(
        database,
        parsedRequest.data.cursor,
        incomingDocuments,
      );
      reconcileReflectionJobs(database, new Date().toISOString());
      aiWorker.wake();
      return reply.send(result);
    } catch {
      return reply
        .code(400)
        .send({ error: 'A document could not be accepted.' });
    }
  });

  const requireDevice = (
    request: Parameters<typeof authenticatedDeviceId>[1],
  ) => authenticatedDeviceId(database, request);

  server.get('/api/ai/configuration', async (request, reply) => {
    if (!requireDevice(request)) {
      return reply.code(401).send({ error: 'Pair this device first.' });
    }
    const configuration = readAiConfiguration(database);
    return reply.send({
      baseUrl: configuration?.baseUrl ?? '',
      hasApiKey: Boolean(configuration?.apiKey),
      model: configuration?.model ?? null,
      paused: configuration?.paused ?? false,
      status: configuration?.status ?? 'not-configured',
      lastCheckedAt: configuration?.lastCheckedAt ?? null,
      lastSucceededAt: configuration?.lastSucceededAt ?? null,
      errorCode: configuration?.errorCode ?? null,
      pendingJobs: pendingJobCount(database),
      failedJobs: failedJobCount(database),
    });
  });

  server.post('/api/ai/models', async (request, reply) => {
    if (!requireDevice(request)) {
      return reply.code(401).send({ error: 'Pair this device first.' });
    }
    const parsed = providerModelsSchema.safeParse(request.body);
    const baseUrl = parsed.success
      ? normalizeProviderBaseUrl(parsed.data.baseUrl)
      : null;
    if (!parsed.success || !baseUrl) {
      return reply.code(400).send({ error: 'Enter a valid model API URL.' });
    }
    try {
      const storedKey = readAiConfiguration(database)?.apiKey ?? '';
      return reply.send({
        models: await loadProviderModels(
          baseUrl,
          parsed.data.apiKey ?? storedKey,
        ),
      });
    } catch {
      return reply
        .code(503)
        .send({ error: 'Mindfull could not load models from that server.' });
    }
  });

  server.put('/api/ai/configuration', async (request, reply) => {
    if (!requireDevice(request)) {
      return reply.code(401).send({ error: 'Pair this device first.' });
    }
    const parsed = aiConfigurationSchema.safeParse(request.body);
    const baseUrl = parsed.success
      ? normalizeProviderBaseUrl(parsed.data.baseUrl)
      : null;
    if (!parsed.success || !baseUrl) {
      return reply.code(400).send({ error: 'Enter a valid model API URL.' });
    }
    const existing = readAiConfiguration(database);
    const apiKey = parsed.data.apiKey ?? existing?.apiKey ?? '';
    const configuration = saveAiConfiguration(
      database,
      { baseUrl, apiKey, model: parsed.data.model },
      new Date().toISOString(),
    );
    reconcileReflectionJobs(database, new Date().toISOString());
    aiWorker.wake();
    return reply.send({ status: configuration.status });
  });

  server.post('/api/ai/pause', async (request, reply) => {
    if (!requireDevice(request)) {
      return reply.code(401).send({ error: 'Pair this device first.' });
    }
    const parsed = z.object({ paused: z.boolean() }).safeParse(request.body);
    if (!parsed.success || !readAiConfiguration(database)) {
      return reply.code(400).send({ error: 'AI is not configured.' });
    }
    setAiPaused(database, parsed.data.paused, new Date().toISOString());
    if (!parsed.data.paused) aiWorker.wake();
    return reply.send({ paused: parsed.data.paused });
  });

  server.post('/api/ai/retry', async (request, reply) => {
    if (!requireDevice(request)) {
      return reply.code(401).send({ error: 'Pair this device first.' });
    }
    const count = retryFailedJobs(database, new Date().toISOString());
    aiWorker.wake();
    return reply.send({ retriedJobs: count });
  });

  server.post('/api/ai/memory/initialize', async (request, reply) => {
    if (!requireDevice(request)) {
      return reply.code(401).send({ error: 'Pair this device first.' });
    }
    const now = new Date().toISOString();
    if (!readAiConfiguration(database)?.model) {
      return reply.code(409).send({ error: 'Choose a model first.' });
    }
    if (!historicalSources(database, now).length) {
      return reply
        .code(409)
        .send({ error: 'There are no reflections from the past year.' });
    }
    if (!queueInitialMemory(database, now)) {
      return reply
        .code(409)
        .send({ error: 'Initial memory is already present or queued.' });
    }
    aiWorker.wake();
    return reply.code(202).send({ status: 'waiting' });
  });

  server.post('/api/ai/memory/reset', async (request, reply) => {
    if (!requireDevice(request)) {
      return reply.code(401).send({ error: 'Pair this device first.' });
    }
    const now = new Date().toISOString();
    database.transaction((transaction) => {
      const memory = findDocument(transaction, reflectionMemoryId);
      if (memory?.type === 'reflection-memory' && !memory.deletedAt) {
        storeDocument(transaction, {
          ...memory,
          deletedAt: now,
          updatedAt: now,
          updatedByDeviceId: 'mindfull-server',
        });
      }
      transaction.delete(aiMemoryBuilds).run();
      transaction
        .delete(aiJobs)
        .where(eq(aiJobs.kind, 'initialize-memory'))
        .run();
    });
    return reply.send({ reset: true });
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
