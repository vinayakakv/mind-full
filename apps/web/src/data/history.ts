import type {
  CheckInDocument,
  DomainDocument,
  HabitLogDocument,
  JournalDocument,
} from '@mindfull/domain';

export type HistoryFilter = 'all' | 'journal' | 'check-in' | 'habit';

export type HistoryEntry =
  | {
      id: string;
      kind: 'journal';
      localDate: string;
      sortAt: string;
      journal: JournalDocument;
    }
  | {
      id: string;
      kind: 'check-in';
      localDate: string;
      sortAt: string;
      checkIn: CheckInDocument;
    }
  | {
      id: string;
      kind: 'habit';
      localDate: string;
      sortAt: string;
      habitLog: HabitLogDocument;
      habitName: string;
    };

const isWrittenJournal = (document: JournalDocument): boolean =>
  Boolean(document.payload.title || document.payload.markdown.trim());

export const historyEntriesFrom = (
  documents: DomainDocument[],
): HistoryEntry[] => {
  const habitNames = new Map(
    documents
      .filter((document) => document.type === 'habit')
      .map((habit) => [habit.id, habit.payload.name]),
  );

  return documents
    .flatMap((document): HistoryEntry[] => {
      if (document.deletedAt) return [];

      if (document.type === 'journal' && isWrittenJournal(document)) {
        return [
          {
            id: document.id,
            kind: 'journal',
            localDate: document.payload.localDate,
            sortAt: document.occurredAt ?? document.createdAt,
            journal: document,
          },
        ];
      }

      if (
        document.type === 'check-in' &&
        document.payload.status === 'completed' &&
        document.payload.completedAt
      ) {
        return [
          {
            id: document.id,
            kind: 'check-in',
            localDate: document.payload.localDate,
            sortAt: document.payload.completedAt,
            checkIn: document,
          },
        ];
      }

      if (document.type === 'habit-log') {
        return [
          {
            id: document.id,
            kind: 'habit',
            localDate: document.payload.localDate,
            sortAt: document.occurredAt ?? document.createdAt,
            habitLog: document,
            habitName:
              habitNames.get(document.payload.habitId) ?? 'Archived habit',
          },
        ];
      }

      return [];
    })
    .sort(
      (left, right) =>
        right.localDate.localeCompare(left.localDate) ||
        right.sortAt.localeCompare(left.sortAt) ||
        right.id.localeCompare(left.id),
    );
};

export const filterHistoryEntries = (
  entries: HistoryEntry[],
  filter: HistoryFilter,
): HistoryEntry[] =>
  filter === 'all' ? entries : entries.filter((entry) => entry.kind === filter);
