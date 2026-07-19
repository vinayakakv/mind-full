import { createHabitSuggestionDocument } from '@mindfull/domain';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { database } from './database';
import {
  acceptHabitSuggestion,
  acceptTaskSuggestion,
  addBodyMeasurement,
  addTask,
  addTaskSuggestion,
  applyRemoteDocuments,
  completeJournal,
  createHabit,
  createJournal,
  deleteBodyMeasurement,
  deleteCheckIn,
  deleteJournal,
  ensureDefaultBodyMetrics,
  findCheckIn,
  findHabitLog,
  findReminder,
  getOrCreateCheckIn,
  getOrCreateMorningCheckIn,
  recordHabitMiss,
  rejectHabitSuggestion,
  rejectTaskSuggestion,
  removeExpiredCompletedTasks,
  reorderHabits,
  restoreHabitOccurrence,
  saveDocument,
  setBodyMetricArchived,
  setCheckInReminder,
  setHabitCompleted,
  setTaskCompleted,
  updateBodyMeasurement,
  updateBodyMetric,
  updateCheckIn,
  updateJournal,
} from './documents';
import { localDocumentsChanged } from './events';

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

  it('claims a foreign document when it becomes a local write', async () => {
    window.localStorage.setItem('mindfull.device-id', 'this-device');
    const task = await addTask('Take a quiet walk');
    const foreignVersion = {
      ...task,
      updatedAt: '2030-07-15T10:00:00.000Z',
      updatedByDeviceId: 'previous-device',
    };

    await saveDocument(foreignVersion);

    expect(await database.documents.get(task.id)).toMatchObject({
      updatedAt: '2030-07-15T10:00:00.001Z',
      updatedByDeviceId: 'this-device',
    });
  });

  it('creates stable body metrics without replacing local preferences', async () => {
    const metrics = await ensureDefaultBodyMetrics();
    const weight = metrics.find(({ id }) => id === 'body-metric:weight');
    expect(metrics).toHaveLength(7);
    expect(weight).toMatchObject({
      createdAt: '2026-01-01T00:00:00.000Z',
      payload: { name: 'Weight', preferredUnit: 'kg' },
    });

    if (!weight) throw new Error('Expected the default Weight metric.');
    await updateBodyMetric(weight.id, {
      name: 'Body weight',
      preferredUnit: 'lb',
    });

    const ensuredAgain = await ensureDefaultBodyMetrics();
    expect(ensuredAgain).toHaveLength(7);
    expect(ensuredAgain.find(({ id }) => id === weight.id)).toMatchObject({
      payload: { name: 'Body weight', preferredUnit: 'lb' },
    });
  });

  it('stores body measurements canonically and tombstones deleted entries', async () => {
    const metrics = await ensureDefaultBodyMetrics();
    const weight = metrics.find(({ id }) => id === 'body-metric:weight');
    if (!weight) throw new Error('Expected the default Weight metric.');
    await updateBodyMetric(weight.id, {
      name: weight.payload.name,
      preferredUnit: 'lb',
    });

    const measurement = await addBodyMeasurement(
      weight.id,
      220.46,
      new Date('2026-07-15T08:30:00.000Z'),
    );
    expect(measurement.payload.value).toBeCloseTo(100, 2);

    const updated = await updateBodyMeasurement(measurement.id, 176.37);
    expect(updated.payload.value).toBeCloseTo(80, 2);
    expect(updated.occurredAt).toBe(measurement.occurredAt);

    await deleteBodyMeasurement(measurement.id);
    expect(await database.documents.get(measurement.id)).toMatchObject({
      deletedAt: expect.any(String),
    });
    expect(await database.syncState.get(measurement.id)).toMatchObject({
      dirty: 1,
    });
  });

  it('archives a body metric without deleting its definition', async () => {
    const [weight] = await ensureDefaultBodyMetrics();
    if (!weight) throw new Error('Expected a default body metric.');

    await setBodyMetricArchived(weight.id, true);
    expect(await database.documents.get(weight.id)).toMatchObject({
      deletedAt: null,
      payload: { archivedAt: expect.any(String) },
    });
  });

  it('does not treat an applied remote version as a new local write', async () => {
    const task = await addTask('Take a quiet walk');
    const localChange = vi.fn();
    window.addEventListener(localDocumentsChanged, localChange);

    await applyRemoteDocuments(
      [
        {
          ...task,
          payload: { ...task.payload, text: 'Take a slow, quiet walk' },
          updatedAt: '2030-07-15T12:00:00.000Z',
          updatedByDeviceId: 'other-device',
        },
      ],
      2,
    );

    expect(localChange).not.toHaveBeenCalled();
    window.removeEventListener(localDocumentsChanged, localChange);
  });

  it('uses one revivable log document for a habit occurrence', async () => {
    const habit = await createHabit({
      name: 'Step outside',
      weekdays: [1, 3, 5],
      reminderTime: null,
    });
    const localDate = '2026-07-15';

    expect(habit.payload.schedules).toEqual([
      {
        effectiveFrom: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        weekdays: [1, 3, 5],
      },
    ]);

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

  it('restores the exact previous habit occurrence after a correction', async () => {
    const habit = await createHabit({
      name: 'Step outside',
      weekdays: [1, 3, 5],
      reminderTime: null,
    });
    const localDate = '2026-07-15';
    await recordHabitMiss(habit.id, localDate, 'The day became too full.');
    const previous = await findHabitLog(habit.id, localDate);

    await setHabitCompleted(habit.id, localDate, true);
    await restoreHabitOccurrence(
      habit.id,
      localDate,
      previous?.payload ?? null,
    );

    expect(await findHabitLog(habit.id, localDate)).toMatchObject({
      payload: {
        outcome: 'missed',
        reason: 'The day became too full.',
      },
    });
  });

  it('stores shared reminder intent beside habits, tasks, and check-ins', async () => {
    const habit = await createHabit({
      name: 'Step outside',
      weekdays: [1, 3, 5],
      reminderTime: '08:15',
    });
    const task = await addTask('Call a friend', '2026-07-16T12:00:00.000Z');
    await setCheckInReminder('evening', '20:30');

    expect(await findReminder('habit', habit.id)).toMatchObject({
      id: `reminder:habit:${habit.id}`,
      payload: { localTime: '08:15', weekdays: [1, 3, 5], enabled: true },
    });
    expect(await findReminder('task', task.id)).toMatchObject({
      payload: { scheduledAt: '2026-07-16T12:00:00.000Z' },
    });
    expect(await findReminder('check-in', 'evening')).toMatchObject({
      payload: { localTime: '20:30', enabled: true },
    });
    expect(
      await database.syncState.get(`reminder:habit:${habit.id}`),
    ).toMatchObject({ dirty: 1 });
  });

  it('persists the chosen habit order', async () => {
    const first = await createHabit({
      name: 'Step outside',
      weekdays: [1, 3, 5],
      reminderTime: null,
    });
    const second = await createHabit({
      name: 'Read quietly',
      weekdays: [1, 3, 5],
      reminderTime: null,
    });
    const third = await createHabit({
      name: 'Stretch',
      weekdays: [1, 3, 5],
      reminderTime: null,
    });

    await reorderHabits([third.id, first.id, second.id]);

    const reordered = await database.documents.bulkGet([
      third.id,
      first.id,
      second.id,
    ]);
    expect(reordered.map((habit) => habit?.sortKey)).toEqual([
      'habit:000000',
      'habit:000001',
      'habit:000002',
    ]);
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

  it('turns an approved suggestion into a sourced task', async () => {
    const journal = await createJournal(new Date('2026-07-14T12:00:00.000Z'));
    const suggestion = await addTaskSuggestion({
      proposedText: 'Call Mum',
      availableFrom: null,
      sourceDocumentId: journal.id,
      sourceContentHash: 'journal-hash',
    });

    const task = await acceptTaskSuggestion(suggestion.id);

    expect(task.payload).toMatchObject({
      text: 'Call Mum',
      source: { kind: 'journal', documentId: journal.id },
    });
    expect(await database.documents.get(suggestion.id)).toMatchObject({
      payload: { state: 'accepted', acceptedTaskId: task.id },
    });
  });

  it('permanently resolves a dismissed suggestion', async () => {
    const journal = await createJournal();
    const suggestion = await addTaskSuggestion({
      proposedText: 'Plan a walk',
      availableFrom: null,
      sourceDocumentId: journal.id,
      sourceContentHash: 'journal-hash',
    });

    await rejectTaskSuggestion(suggestion.id);
    await rejectTaskSuggestion(suggestion.id);

    expect(await database.documents.get(suggestion.id)).toMatchObject({
      payload: { state: 'rejected', acceptedTaskId: null },
    });
  });

  it('turns an approved habit suggestion into a configured habit', async () => {
    const journal = await createJournal();
    const suggestion = createHabitSuggestionDocument({
      id: 'habit-suggestion:walk',
      now: '2026-07-15T08:00:00.000Z',
      deviceId: 'server',
      payload: {
        proposedName: 'Take a short walk',
        reason: 'A short walk has helped more than once.',
        sourceDocumentId: journal.id,
        sourceContentHash: 'journal-hash',
        state: 'pending',
        acceptedHabitId: null,
      },
    });
    await saveDocument(suggestion);

    const habit = await acceptHabitSuggestion(suggestion.id, {
      name: suggestion.payload.proposedName,
      weekdays: [1, 3, 5],
      reminderTime: '08:30',
    });

    expect(habit).toMatchObject({
      id: `habit:from-suggestion:${suggestion.id}`,
      payload: { name: 'Take a short walk', weekdays: [1, 3, 5] },
    });
    expect(await findReminder('habit', habit.id)).toMatchObject({
      payload: { localTime: '08:30', weekdays: [1, 3, 5] },
    });
    expect(await database.documents.get(suggestion.id)).toMatchObject({
      payload: { state: 'accepted', acceptedHabitId: habit.id },
    });
  });

  it('permanently resolves a dismissed habit suggestion', async () => {
    const suggestion = createHabitSuggestionDocument({
      id: 'habit-suggestion:stretch',
      now: '2026-07-15T08:00:00.000Z',
      deviceId: 'server',
      payload: {
        proposedName: 'Stretch after lunch',
        reason: 'It may support a gentler afternoon.',
        sourceDocumentId: 'journal:one',
        sourceContentHash: 'journal-hash',
        state: 'pending',
        acceptedHabitId: null,
      },
    });
    await saveDocument(suggestion);

    await rejectHabitSuggestion(suggestion.id);
    await rejectHabitSuggestion(suggestion.id);

    expect(await database.documents.get(suggestion.id)).toMatchObject({
      payload: { state: 'rejected', acceptedHabitId: null },
    });
  });

  it('tombstones completed tasks after the configured retention period', async () => {
    const task = await addTask('Return a book', '2026-07-02T09:00:00.000Z');
    await saveDocument({
      ...task,
      payload: { ...task.payload, completedAt: '2026-07-08T12:00:00.000Z' },
      updatedAt: '2026-07-08T12:00:00.000Z',
    });

    expect(
      await removeExpiredCompletedTasks(new Date('2026-07-15T12:00:00.000Z')),
    ).toBe(1);
    expect(await removeExpiredCompletedTasks()).toBe(0);
    expect(await database.documents.get(task.id)).toMatchObject({
      deletedAt: '2026-07-15T12:00:00.000Z',
    });
    expect(await findReminder('task', task.id)).toMatchObject({
      deletedAt: '2026-07-15T12:00:00.000Z',
    });
    expect(await database.syncState.get(task.id)).toMatchObject({ dirty: 1 });
  });

  it('autosaves, completes, and tombstones a journal locally', async () => {
    const journal = await createJournal(new Date('2026-07-14T12:00:00.000Z'));

    const updated = await updateJournal(journal.id, {
      title: 'Evening light',
      markdown: 'The sky was **violet**.',
    });

    expect(updated.payload.markdown).toBe('The sky was **violet**.');
    expect(await database.syncState.get(journal.id)).toMatchObject({
      dirty: 1,
    });

    const completed = await completeJournal(
      journal.id,
      new Date('2026-07-14T12:05:00.000Z'),
    );
    expect(completed.payload).toMatchObject({
      status: 'completed',
      completedAt: '2026-07-14T12:05:00.000Z',
    });
    await expect(
      updateJournal(journal.id, {
        title: 'A revised title',
        markdown: 'A revised memory.',
      }),
    ).rejects.toThrow('completed journal');

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

  it('does not reopen a completed check-in for changes', async () => {
    const checkIn = await getOrCreateMorningCheckIn();
    await updateCheckIn(checkIn.id, (payload) => ({
      ...payload,
      status: 'completed',
      completedAt: '2026-07-14T12:05:00.000Z',
    }));

    await expect(
      updateCheckIn(checkIn.id, (payload) => ({
        ...payload,
        mood: 'Light',
      })),
    ).rejects.toThrow('completed check-in');

    await deleteCheckIn(checkIn.id);
    expect(await database.documents.get(checkIn.id)).toMatchObject({
      deletedAt: expect.any(String),
    });
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
