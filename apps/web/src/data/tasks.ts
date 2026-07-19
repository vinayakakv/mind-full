import type {
  CheckInDocument,
  DomainDocument,
  JournalDocument,
  TaskDocument,
  TaskSuggestionDocument,
} from '@mindfull/domain';

import {
  acceptTaskSuggestion,
  addTask,
  addTaskSuggestion,
  deleteTask,
  documentTable,
  rejectTaskSuggestion,
  removeExpiredCompletedTasks,
  setTaskCompleted,
  snoozeTaskReminder,
} from './document-store';

export {
  acceptTaskSuggestion,
  addTask,
  addTaskSuggestion,
  deleteTask,
  rejectTaskSuggestion,
  removeExpiredCompletedTasks,
  setTaskCompleted,
  snoozeTaskReminder,
};

export const orderTasksForList = (
  tasks: readonly TaskDocument[],
): TaskDocument[] =>
  [...tasks].sort((left, right) => {
    const completionOrder =
      Number(Boolean(left.payload.completedAt)) -
      Number(Boolean(right.payload.completedAt));
    if (completionOrder) return completionOrder;

    const leftAt = left.payload.completedAt ?? left.createdAt;
    const rightAt = right.payload.completedAt ?? right.createdAt;
    return rightAt.localeCompare(leftAt) || right.id.localeCompare(left.id);
  });

export const loadTasks = async (): Promise<TaskDocument[]> => {
  const documents = await documentTable()
    .where('type')
    .equals('task')
    .toArray();
  return documents.filter(
    (document): document is TaskDocument => document.type === 'task',
  );
};

export const loadTaskSuggestionContext = async (): Promise<
  DomainDocument[]
> => {
  const [suggestions, journals, checkIns] = await Promise.all([
    documentTable().where('type').equals('task-suggestion').toArray(),
    documentTable().where('type').equals('journal').toArray(),
    documentTable().where('type').equals('check-in').toArray(),
  ]);

  return [
    ...suggestions.filter(
      (document): document is TaskSuggestionDocument =>
        document.type === 'task-suggestion',
    ),
    ...journals.filter(
      (document): document is JournalDocument => document.type === 'journal',
    ),
    ...checkIns.filter(
      (document): document is CheckInDocument => document.type === 'check-in',
    ),
  ];
};
