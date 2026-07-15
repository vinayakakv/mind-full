import { createTaskDocument } from '@mindfull/domain';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { database } from './database';
import {
  claimLocalDocument,
  dirtyDocumentsForSync,
} from './document-ownership';

const taskFrom = (deviceId: string, id = `task:${deviceId}`) =>
  createTaskDocument({
    id,
    now: '2026-07-15T10:00:00.000Z',
    deviceId,
    sortKey: id,
    payload: {
      text: 'Take a quiet walk',
      completedAt: null,
      availableFrom: null,
      reminderAt: null,
      source: { kind: 'manual' },
    },
  });

describe('local document ownership', () => {
  beforeEach(async () => {
    await database.delete();
    await database.open();
  });

  afterAll(() => database.close());

  it('claims an older device version without changing current ownership', () => {
    const current = taskFrom('this-device');
    const previous = taskFrom('previous-device');

    expect(
      claimLocalDocument(current, 'this-device', '2026-07-15T11:00:00.000Z'),
    ).toBe(current);
    expect(
      claimLocalDocument(previous, 'this-device', '2026-07-15T11:00:00.000Z'),
    ).toMatchObject({
      updatedAt: '2026-07-15T11:00:00.000Z',
      updatedByDeviceId: 'this-device',
    });
  });

  it('repairs only dirty documents and remains idempotent', async () => {
    const dirty = taskFrom('previous-device', 'dirty-task');
    const clean = taskFrom('other-device', 'clean-task');
    await database.documents.bulkPut([dirty, clean]);
    await database.syncState.bulkPut([
      {
        documentId: dirty.id,
        dirty: 1,
        lastSyncedAt: null,
        lastServerVersion: null,
      },
      {
        documentId: clean.id,
        dirty: 0,
        lastSyncedAt: '2026-07-15T10:30:00.000Z',
        lastServerVersion: 1,
      },
    ]);

    const repaired = await dirtyDocumentsForSync(
      'this-device',
      '2026-07-15T11:00:00.000Z',
    );
    const repairedAgain = await dirtyDocumentsForSync(
      'this-device',
      '2026-07-15T12:00:00.000Z',
    );

    expect(repaired).toEqual([
      expect.objectContaining({
        id: dirty.id,
        updatedAt: '2026-07-15T11:00:00.000Z',
        updatedByDeviceId: 'this-device',
      }),
    ]);
    expect(repairedAgain).toEqual(repaired);
    expect(await database.documents.get(clean.id)).toEqual(clean);
  });
});
