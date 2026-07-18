import type {
  CheckInDocument,
  HabitSuggestionDocument,
  JournalDocument,
  ReflectionMemoryDocument,
  TaskSuggestionDocument,
  WeeklyReflectionDocument,
} from '@mindfull/domain';

import { documentTable } from './document-store';

export type ReflectionData = {
  memory: ReflectionMemoryDocument | null;
  currentWeek: WeeklyReflectionDocument | null;
  taskSuggestions: Array<{
    suggestion: TaskSuggestionDocument;
    source: JournalDocument | CheckInDocument | undefined;
  }>;
  habitSuggestions: Array<{
    suggestion: HabitSuggestionDocument;
    source: JournalDocument | CheckInDocument | undefined;
  }>;
  latestSources: Array<JournalDocument | CheckInDocument>;
};

export const loadReflectionData = async (): Promise<ReflectionData> => {
  const documents = await documentTable()
    .filter((document) =>
      [
        'reflection-memory',
        'weekly-reflection',
        'task-suggestion',
        'habit-suggestion',
        'journal',
        'check-in',
      ].includes(document.type),
    )
    .toArray();
  const memory = documents.find(
    (document): document is ReflectionMemoryDocument =>
      document.type === 'reflection-memory' && !document.deletedAt,
  );
  const sourceIds = new Set(memory?.payload.updatedFromDocumentIds ?? []);
  const documentsById = new Map(
    documents.map((document) => [document.id, document]),
  );
  const sourceFor = (sourceDocumentId: string) => {
    const source = documentsById.get(sourceDocumentId);
    return source?.type === 'journal' || source?.type === 'check-in'
      ? source
      : undefined;
  };

  return {
    memory: memory ?? null,
    currentWeek:
      documents.find(
        (document): document is WeeklyReflectionDocument =>
          document.type === 'weekly-reflection' && !document.deletedAt,
      ) ?? null,
    taskSuggestions: documents
      .filter(
        (document): document is TaskSuggestionDocument =>
          document.type === 'task-suggestion' &&
          !document.deletedAt &&
          document.payload.state === 'pending',
      )
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map((suggestion) => ({
        suggestion,
        source: sourceFor(suggestion.payload.sourceDocumentId),
      })),
    habitSuggestions: documents
      .filter(
        (document): document is HabitSuggestionDocument =>
          document.type === 'habit-suggestion' &&
          !document.deletedAt &&
          document.payload.state === 'pending',
      )
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map((suggestion) => ({
        suggestion,
        source: sourceFor(suggestion.payload.sourceDocumentId),
      })),
    latestSources: documents.filter(
      (document): document is JournalDocument | CheckInDocument =>
        (document.type === 'journal' || document.type === 'check-in') &&
        sourceIds.has(document.id),
    ),
  };
};
