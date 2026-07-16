import type { CheckInDocument } from '@mindfull/domain';

import {
  deleteCheckIn,
  documentTable,
  findCheckIn,
  getOrCreateCheckIn,
  getOrCreateMorningCheckIn,
  updateCheckIn,
} from './document-store';

export {
  deleteCheckIn,
  findCheckIn,
  getOrCreateCheckIn,
  getOrCreateMorningCheckIn,
  updateCheckIn,
};

export const loadCheckIn = async (
  checkInId: string,
): Promise<CheckInDocument | undefined> => {
  const document = await documentTable().get(checkInId);
  return document?.type === 'check-in' && !document.deletedAt
    ? document
    : undefined;
};
