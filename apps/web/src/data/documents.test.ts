import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { database } from './database';
import {
  addTask,
  createJournal,
  deleteJournal,
  findCheckIn,
  getOrCreateCheckIn,
  getOrCreateMorningCheckIn,
  setTaskCompleted,
  updateCheckIn,
  updateJournal,
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

  it('autosaves and tombstones a journal locally', async () => {
    const journal = await createJournal(new Date('2026-07-14T12:00:00.000Z'));

    const updated = await updateJournal(journal.id, {
      title: 'Evening light',
      markdown: 'The sky was **violet**.',
    });

    expect(updated.payload.markdown).toBe('The sky was **violet**.');
    expect(await database.syncState.get(journal.id)).toMatchObject({
      dirty: 1,
    });

    await deleteJournal(journal.id);
    expect(
      (await database.documents.get(journal.id))?.deletedAt,
    ).not.toBeNull();
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

  it('keeps morning and evening check-ins independent', async () => {
    const date = new Date('2026-07-14T12:00:00.000Z');
    const morning = await getOrCreateCheckIn('morning', date);
    const evening = await getOrCreateCheckIn('evening', date);

    expect(morning.id).not.toBe(evening.id);
    expect(morning.payload.responses).toHaveLength(3);
    expect(evening.payload.responses).toHaveLength(4);
    expect(await findCheckIn('morning', morning.payload.localDate)).toEqual(
      morning,
    );
    expect(await findCheckIn('evening', evening.payload.localDate)).toEqual(
      evening,
    );
  });
});
