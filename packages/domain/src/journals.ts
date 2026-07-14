import type { JournalPayload } from './documents.js';

const plainFirstLine = (markdown: string): string | undefined => {
  const firstLine = markdown
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean);

  return firstLine?.replace(/^#{1,6}\s+/, '').replace(/^[-*>]\s+/, '');
};

export const journalHeading = (
  journal: JournalPayload,
  formattedDate: string,
): string => journal.title ?? plainFirstLine(journal.markdown) ?? formattedDate;

export const journalBody = (journal: JournalPayload): string => {
  if (journal.title) return journal.markdown;

  const lines = journal.markdown.split('\n');
  const firstWrittenLine = lines.findIndex((line) => line.trim().length > 0);

  return firstWrittenLine < 0
    ? ''
    : lines
        .slice(firstWrittenLine + 1)
        .join('\n')
        .trimStart();
};
