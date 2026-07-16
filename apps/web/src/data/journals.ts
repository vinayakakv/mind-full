import type { JournalDocument } from '@mindfull/domain';

import {
  completeJournal,
  createJournal,
  deleteJournal,
  documentTable,
  updateJournal,
} from './document-store';

export { completeJournal, createJournal, deleteJournal, updateJournal };

export const loadJournal = async (
  journalId: string,
): Promise<JournalDocument | undefined> => {
  const document = await documentTable().get(journalId);
  return document?.type === 'journal' && !document.deletedAt
    ? document
    : undefined;
};
