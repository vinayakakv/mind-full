import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { database } from './database';
import {
  addTask,
  createHabit,
  createJournal,
  deleteJournal,
  findCheckIn,
  findHabitLog,
  getOrCreateCheckIn,
  getOrCreateMorningCheckIn,
  recordHabitMiss,
  setHabitCompleted,
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

  it('uses one revivable log document for a habit occurrence', async () => {
    const habit = await createHabit({
      name: 'Step outside',
      weekdays: [1, 3, 5],
      reminderTime: null,
    });
    const localDate = '2026-07-15';

    await setHabitCompleted(habit.id, localDate, true);
    const firstLog = await findHabitLog(habit.id, localDate);
    expect(firstLog?.payload.outcome).toBe('completed');

    await setHabitCompleted(habit.id, localDate, false);
    expect(await findHabitLog(habit.id, localDate)).toBeUndefined();

    await setHabitCompleted(habit.id, localDate, true);
    const restoredLog = await findHabitLog(habit.id, localDate);
    expect(restoredLog?.id).toBe(firstLog?.id);

    await recordHabitMiss(habit.id, localDate, 'The day became too full.');
    expect(await findHabitLog(habit.id, localDate)).toMatchObject({
      id: firstLog?.id,
      payload: {
        outcome: 'missed',
        reason: 'The day became too full.',
      },
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
