import type {
  HabitDocument,
  HabitLogDocument,
  HabitSuggestionDocument,
} from '@mindfull/domain';

import {
  acceptHabitSuggestion,
  createHabit,
  documentTable,
  loadHabitSuggestion,
  recordHabitMiss,
  rejectHabitSuggestion,
  reorderHabits,
  setHabitArchived,
  setHabitCompleted,
  updateHabit,
} from './document-store';

export {
  acceptHabitSuggestion,
  createHabit,
  loadHabitSuggestion,
  recordHabitMiss,
  rejectHabitSuggestion,
  reorderHabits,
  setHabitArchived,
  setHabitCompleted,
  updateHabit,
};

export const loadPendingHabitSuggestion = async (
  suggestionId: string,
): Promise<HabitSuggestionDocument | undefined> =>
  loadHabitSuggestion(suggestionId);

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
