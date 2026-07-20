import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  createHabitDocument,
  createJournalDocument,
  createReminderDocument,
  createTaskDocument,
} from '@mindfull/domain';
import { afterEach, describe, expect, it } from 'vitest';

import type { AiInvoker } from './ai/provider.js';
import { buildServer } from './server.js';

const temporaryDirectories: string[] = [];

const createTestServer = async (ai?: {
  invoker: AiInvoker;
  modelLoader: () => Promise<string[]>;
}) => {
  const directory = mkdtempSync(join(tmpdir(), 'mindfull-server-'));
  temporaryDirectories.push(directory);

  return buildServer({
    databasePath: join(directory, 'mindfull.sqlite'),
    migrationsFolder: resolve('drizzle'),
    pairingCode: 'quiet-code',
    webRoot: null,
    backup: null,
    ...(ai ? { aiInvoker: ai.invoker, aiModelLoader: ai.modelLoader } : {}),
  });
};

const pairDevice = async (
  server: Awaited<ReturnType<typeof createTestServer>>,
  deviceId: string,
) => {
  const response = await server.inject({
    method: 'POST',
    url: '/api/pair',
    payload: {
      pairingCode: 'quiet-code',
      deviceId,
      deviceName: deviceId,
    },
  });

  expect(response.statusCode).toBe(200);
  return response.json<{ token: string }>().token;
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('Mindfull server', () => {
  it('pairs devices and synchronizes the winning document version', async () => {
    const server = await createTestServer();
    const phoneToken = await pairDevice(server, 'phone');
    const desktopToken = await pairDevice(server, 'desktop');
    const phoneTask = createTaskDocument({
      id: '01-task',
      now: '2026-07-14T12:00:00.000Z',
      deviceId: 'phone',
      sortKey: 'a0',
      payload: {
        text: 'Take a quiet walk',
        completedAt: null,
        availableFrom: null,
        reminderAt: null,
        source: { kind: 'manual' },
      },
    });
    const phoneReminder = createReminderDocument({
      id: `reminder:task:${phoneTask.id}`,
      now: '2026-07-14T12:00:00.000Z',
      deviceId: 'phone',
      payload: {
        targetType: 'task',
        targetId: phoneTask.id,
        scheduledAt: '2026-07-14T13:00:00.000Z',
        localTime: null,
        weekdays: null,
        enabled: true,
      },
    });

    const phoneSync = await server.inject({
      method: 'POST',
      url: '/api/sync',
      headers: { authorization: `Bearer ${phoneToken}` },
      payload: { cursor: 0, documents: [phoneTask, phoneReminder] },
    });

    expect(phoneSync.statusCode).toBe(200);
    const firstSync = phoneSync.json<{
      cursor: number;
      documents: Array<{ id: string }>;
    }>();
    expect(firstSync.documents).toContainEqual(
      expect.objectContaining({ id: phoneTask.id }),
    );

    const desktopPull = await server.inject({
      method: 'POST',
      url: '/api/sync',
      headers: { authorization: `Bearer ${desktopToken}` },
      payload: { cursor: 0, documents: [] },
    });
    expect(desktopPull.json().documents).toContainEqual(
      expect.objectContaining({ id: phoneTask.id }),
    );
    expect(desktopPull.json().documents).toContainEqual(
      expect.objectContaining({ id: phoneReminder.id }),
    );

    const desktopTask = {
      ...phoneTask,
      payload: { ...phoneTask.payload, text: 'Take a slow, quiet walk' },
      updatedAt: '2026-07-14T12:05:00.000Z',
      updatedByDeviceId: 'desktop',
    };
    await server.inject({
      method: 'POST',
      url: '/api/sync',
      headers: { authorization: `Bearer ${desktopToken}` },
      payload: { cursor: 0, documents: [desktopTask] },
    });

    const stalePhonePush = await server.inject({
      method: 'POST',
      url: '/api/sync',
      headers: { authorization: `Bearer ${phoneToken}` },
      payload: { cursor: firstSync.cursor, documents: [phoneTask] },
    });
    expect(stalePhonePush.json().documents).toContainEqual(
      expect.objectContaining({
        id: phoneTask.id,
        payload: expect.objectContaining({ text: 'Take a slow, quiet walk' }),
      }),
    );

    await server.close();
  });

  it('rejects changes to a completed journal but accepts its tombstone', async () => {
    const server = await createTestServer();
    const token = await pairDevice(server, 'phone');
    const journal = createJournalDocument({
      id: '01-journal',
      now: '2026-07-14T12:00:00.000Z',
      deviceId: 'phone',
      payload: {
        title: null,
        markdown: 'The rain arrived softly.',
        localDate: '2026-07-14',
        timezone: 'Asia/Kolkata',
        status: 'completed',
        completedAt: '2026-07-14T12:00:00.000Z',
      },
    });

    const firstSync = await server.inject({
      method: 'POST',
      url: '/api/sync',
      headers: { authorization: `Bearer ${token}` },
      payload: { cursor: 0, documents: [journal] },
    });
    expect(firstSync.statusCode).toBe(200);

    const editedSync = await server.inject({
      method: 'POST',
      url: '/api/sync',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        cursor: 0,
        documents: [
          {
            ...journal,
            payload: { ...journal.payload, markdown: 'Rewritten.' },
            updatedAt: '2026-07-14T12:05:00.000Z',
          },
        ],
      },
    });
    expect(editedSync.statusCode).toBe(400);

    const deletedAt = '2026-07-14T12:06:00.000Z';
    const deleteSync = await server.inject({
      method: 'POST',
      url: '/api/sync',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        cursor: 0,
        documents: [{ ...journal, deletedAt, updatedAt: deletedAt }],
      },
    });
    expect(deleteSync.statusCode).toBe(200);

    await server.close();
  });

  it('turns a synchronized reflection into one atomic memory transition', async () => {
    const server = await createTestServer({
      modelLoader: async () => ['quiet-model'],
      invoker: {
        reflect: async (configuration, input) => {
          expect(configuration.responseTimeoutMinutes).toBe(10);
          if (input.sourceKind === 'memory-batch') {
            return {
              updatedMemory: {
                context: ['The past year includes restorative rainy mornings.'],
                supportivePatterns: ['Quiet observation.'],
                recurringThemes: ['Weather and rest.'],
                ongoingCommitments: [],
                openQuestions: [],
                uncertainImpressions: [],
              },
              updatedWeek: {
                summary: '',
                brightSpots: [],
                difficultParts: [],
                supportiveActions: [],
                questionsToCarry: [],
              },
              taskSuggestions: [],
              habitSuggestions: [],
            };
          }
          expect(input.activeTasks).toContain('Water the plants');
          expect(input.activeHabits).toContainEqual({
            name: 'Open the curtains',
            weekdays: [1, 2, 3, 4, 5],
          });
          return {
            updatedMemory: {
              context: ['Rainy afternoons can feel restorative.'],
              supportivePatterns: ['Quiet observation.'],
              recurringThemes: ['Weather and rest.'],
              ongoingCommitments: [],
              openQuestions: [],
              uncertainImpressions: ['This may be a temporary preference.'],
            },
            updatedWeek: {
              summary: `A quiet reflection: ${input.sourceText}`,
              brightSpots: ['Listening to rain'],
              difficultParts: [],
              supportiveActions: ['Sitting quietly by the window'],
              questionsToCarry: [],
            },
            taskSuggestions: [
              { text: 'Water my houseplants', reason: null },
              { text: 'Make time to watch the rain', reason: null },
            ],
            habitSuggestions: [
              { text: 'Open the curtains each weekday', reason: null },
              {
                text: 'Sit quietly by the window',
                reason: 'Quiet observation felt supportive.',
              },
            ],
          };
        },
        findSuggestionDuplicates: async (_configuration, input) => {
          expect(input.existingTasks).toContain('Water the plants');
          expect(input.existingHabits).toContain('Open the curtains');
          expect(input.taskCandidates).toEqual([
            'Water my houseplants',
            'Make time to watch the rain',
          ]);
          expect(input.habitCandidates).toEqual([
            'Open the curtains each weekday',
            'Sit quietly by the window',
          ]);
          return {
            taskDuplicates: [true, false],
            habitDuplicates: [true, false],
          };
        },
        rebuildWeek: async (_configuration, input) => ({
          updatedWeek: {
            summary: `Rebuilt from this week: ${input.sourceText}`,
            brightSpots: ['Listening to rain'],
            difficultParts: [],
            supportiveActions: ['Sitting quietly by the window'],
            questionsToCarry: [],
          },
        }),
      },
    });
    const token = await pairDevice(server, 'phone');
    const authorization = { authorization: `Bearer ${token}` };

    const configuration = await server.inject({
      method: 'PUT',
      url: '/api/ai/configuration',
      headers: authorization,
      payload: {
        baseUrl: 'http://llama.local:8080/v1',
        apiKey: '',
        model: 'quiet-model',
        responseTimeoutMinutes: 10,
      },
    });
    expect(configuration.statusCode).toBe(200);

    const completedAt = new Date().toISOString();
    const task = createTaskDocument({
      id: 'active-task',
      now: completedAt,
      deviceId: 'phone',
      payload: {
        text: 'Water the plants',
        completedAt: null,
        availableFrom: null,
        reminderAt: null,
        source: { kind: 'manual' },
      },
    });
    const habit = createHabitDocument({
      id: 'active-habit',
      now: completedAt,
      deviceId: 'phone',
      payload: {
        name: 'Open the curtains',
        weekdays: [1, 2, 3, 4, 5],
        schedules: [],
        reminderTime: null,
        archivedAt: null,
      },
    });
    const journal = createJournalDocument({
      id: 'reflection-journal',
      now: completedAt,
      deviceId: 'phone',
      payload: {
        title: null,
        markdown: 'I sat by the window and listened to the rain.',
        localDate: completedAt.slice(0, 10),
        timezone: 'UTC',
        status: 'completed',
        completedAt,
      },
    });
    const firstSync = await server.inject({
      method: 'POST',
      url: '/api/sync',
      headers: authorization,
      payload: { cursor: 0, documents: [task, habit, journal] },
    });
    expect(firstSync.statusCode).toBe(200);

    let generated: Array<{ type: string }> = [];
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      const pull = await server.inject({
        method: 'POST',
        url: '/api/sync',
        headers: authorization,
        payload: { cursor: 0, documents: [] },
      });
      generated = pull.json<{ documents: Array<{ type: string }> }>().documents;
      if (generated.some(({ type }) => type === 'reflection-memory')) break;
    }

    expect(generated).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'reflection-memory' }),
        expect.objectContaining({ type: 'weekly-reflection' }),
        expect.objectContaining({ type: 'task-suggestion' }),
        expect.objectContaining({ type: 'habit-suggestion' }),
      ]),
    );
    expect(
      generated.filter(({ type }) => type === 'task-suggestion'),
    ).toHaveLength(1);
    expect(
      generated.filter(({ type }) => type === 'habit-suggestion'),
    ).toHaveLength(1);

    const rebuild = await server.inject({
      method: 'POST',
      url: '/api/ai/reflections/rebuild',
      headers: authorization,
      payload: { localDate: journal.payload.localDate },
    });
    expect(rebuild.statusCode).toBe(202);

    let rebuilt: Array<{
      type: string;
      deletedAt: string | null;
      payload: { sections?: { summary?: string } };
    }> = [];
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      const pull = await server.inject({
        method: 'POST',
        url: '/api/sync',
        headers: authorization,
        payload: { cursor: 0, documents: [] },
      });
      rebuilt = pull.json<{ documents: typeof rebuilt }>().documents;
      if (
        rebuilt.some(
          (document) =>
            document.type === 'weekly-reflection' &&
            document.payload.sections?.summary?.startsWith('Rebuilt'),
        )
      ) {
        break;
      }
    }

    expect(rebuilt).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'reflection-memory', deletedAt: null }),
        expect.objectContaining({
          type: 'weekly-reflection',
          deletedAt: null,
          payload: expect.objectContaining({
            sections: expect.objectContaining({
              summary: expect.stringContaining('Rebuilt from this week'),
            }),
          }),
        }),
        expect.objectContaining({
          type: 'task-suggestion',
          deletedAt: expect.any(String),
        }),
        expect.objectContaining({
          type: 'habit-suggestion',
          deletedAt: expect.any(String),
        }),
      ]),
    );
    await server.close();
  });

  it('reports why a configured model provider is unavailable', async () => {
    const server = await createTestServer({
      modelLoader: async () => {
        throw { cause: { code: 'ECONNREFUSED' } };
      },
      invoker: {
        reflect: async () => {
          throw new Error('The invoker should not run.');
        },
        findSuggestionDuplicates: async () => {
          throw new Error('The invoker should not run.');
        },
        rebuildWeek: async () => {
          throw new Error('The invoker should not run.');
        },
      },
    });
    const token = await pairDevice(server, 'phone');
    const authorization = { authorization: `Bearer ${token}` };

    await server.inject({
      method: 'PUT',
      url: '/api/ai/configuration',
      headers: authorization,
      payload: {
        baseUrl: 'http://quiet-model.local/v1',
        apiKey: '',
        model: 'quiet-model',
        responseTimeoutMinutes: 5,
      },
    });

    let configuration: { status: string; errorCode: string | null } = {
      status: 'checking',
      errorCode: null,
    };
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      const response = await server.inject({
        method: 'GET',
        url: '/api/ai/configuration',
        headers: authorization,
      });
      configuration = response.json();
      if (configuration.status === 'unavailable') break;
    }

    expect(configuration).toEqual(
      expect.objectContaining({
        status: 'unavailable',
        errorCode: 'connection-refused',
      }),
    );

    const completedAt = new Date(Date.now() - 60_000).toISOString();
    const journal = createJournalDocument({
      id: 'memory-progress-journal',
      now: completedAt,
      deviceId: 'phone',
      payload: {
        title: null,
        markdown: 'A quiet morning felt restorative.',
        localDate: completedAt.slice(0, 10),
        timezone: 'UTC',
        status: 'completed',
        completedAt,
      },
    });
    await server.inject({
      method: 'POST',
      url: '/api/sync',
      headers: authorization,
      payload: { cursor: 0, documents: [journal] },
    });
    const rebuild = await server.inject({
      method: 'POST',
      url: '/api/ai/reflections/rebuild',
      headers: authorization,
      payload: { localDate: completedAt.slice(0, 10) },
    });
    expect(rebuild.statusCode).toBe(202);

    const progressResponse = await server.inject({
      method: 'GET',
      url: '/api/ai/configuration',
      headers: authorization,
    });
    expect(progressResponse.json()).toMatchObject({
      reflectionRebuild: {
        state: 'waiting',
        phase: 'memory',
        processedSources: 0,
        totalSources: 1,
      },
    });
    await server.close();
  });
});
