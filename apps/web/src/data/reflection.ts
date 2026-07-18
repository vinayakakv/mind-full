import type {
  AnalysisResultDocument,
  CheckInDocument,
  JournalDocument,
  ReflectionMemoryDocument,
} from '@mindfull/domain';

import { documentTable } from './document-store';

export type ReflectionData = {
  memory: ReflectionMemoryDocument | null;
  analyses: AnalysisResultDocument[];
  latestSources: Array<JournalDocument | CheckInDocument>;
};

export const loadReflectionData = async (): Promise<ReflectionData> => {
  const documents = await documentTable()
    .filter((document) =>
      ['reflection-memory', 'analysis-result', 'journal', 'check-in'].includes(
        document.type,
      ),
    )
    .toArray();
  const memory = documents.find(
    (document): document is ReflectionMemoryDocument =>
      document.type === 'reflection-memory' && !document.deletedAt,
  );
  const sourceIds = new Set(memory?.payload.updatedFromDocumentIds ?? []);

  return {
    memory: memory ?? null,
    analyses: documents
      .filter(
        (document): document is AnalysisResultDocument =>
          document.type === 'analysis-result' && !document.deletedAt,
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    latestSources: documents.filter(
      (document): document is JournalDocument | CheckInDocument =>
        (document.type === 'journal' || document.type === 'check-in') &&
        sourceIds.has(document.id),
    ),
  };
};
