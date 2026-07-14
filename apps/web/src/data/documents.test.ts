import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { database } from './database';
import {
  addTask,
  getOrCreateMorningCheckIn,
  setTaskCompleted,
  updateCheckIn,
} from './documents';

describe('local documents', () => {
  beforeEach(async () => {
    await database.delete();
    await database.open();
    window.localStorage.clear();
  });

  afterAll(() => database.close());

  it('stores a task locally and marks it for sync', async () => {
    const task = await addTask('Take a quiet walk');

    expect(await database.documents.get(task.id)).toEqual(task);
    expect(await database.syncState.get(task.id)).toMatchObject({
      dirty: 1,
    });
  });

  it('persists a task completion as a new document version', async () => {
    const task = await addTask('Drink water');

    await setTaskCompleted(task.id, true);

    const completedTask = await database.documents.get(task.id);
    expect(completedTask?.type).toBe('task');

    if (completedTask?.type === 'task') {
      expect(completedTask.payload.completedAt).not.toBeNull();
      expect(task.payload.completedAt).toBeNull();
    }
  });

  it('resumes the same persisted morning check-in draft', async () => {
    const checkIn = await getOrCreateMorningCheckIn();
    await updateCheckIn(checkIn.id, (payload) => ({
      ...payload,
      currentStep: 2,
    }));

    const resumedCheckIn = await getOrCreateMorningCheckIn();
    expect(resumedCheckIn.id).toBe(checkIn.id);
    expect(resumedCheckIn.payload.currentStep).toBe(2);
  });
});
