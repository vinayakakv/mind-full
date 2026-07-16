import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  createJournalDocument,
  createReminderDocument,
  createTaskDocument,
} from '@mindfull/domain';
import { afterEach, describe, expect, it } from 'vitest';

import { buildServer } from './server.js';

const temporaryDirectories: string[] = [];

const createTestServer = async () => {
  const directory = mkdtempSync(join(tmpdir(), 'mindfull-server-'));
  temporaryDirectories.push(directory);

  return buildServer({
    databasePath: join(directory, 'mindfull.sqlite'),
    migrationsFolder: resolve('drizzle'),
    pairingCode: 'quiet-code',
    webRoot: null,
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
});
