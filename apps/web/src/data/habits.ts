import type { HabitDocument, HabitLogDocument } from '@mindfull/domain';

import {
  createHabit,
  documentTable,
  recordHabitMiss,
  reorderHabits,
  setHabitArchived,
  setHabitCompleted,
  updateHabit,
} from './document-store';

export {
  createHabit,
  recordHabitMiss,
  reorderHabits,
  setHabitArchived,
  setHabitCompleted,
  updateHabit,
};

const habitOrder = (habit: HabitDocument): string =>
  habit.sortKey ?? `habit:${habit.createdAt}:${habit.id}`;

export const loadHabitDocuments = async (): Promise<{
  habits: HabitDocument[];
  logs: HabitLogDocument[];
}> => {
  const [habitResults, logResults] = await Promise.all([
    documentTable().where('type').equals('habit').toArray(),
    documentTable().where('type').equals('habit-log').toArray(),
  ]);

  return {
    habits: habitResults
      .filter(
        (document): document is HabitDocument =>
          document.type === 'habit' && !document.deletedAt,
      )
      .sort(
        (left, right) =>
          habitOrder(left).localeCompare(habitOrder(right)) ||
          left.id.localeCompare(right.id),
      ),
    logs: logResults.filter(
      (document): document is HabitLogDocument =>
        document.type === 'habit-log' && !document.deletedAt,
    ),
  };
};
