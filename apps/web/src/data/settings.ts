import type { SettingsDocument } from '@mindfull/domain';

import {
  documentTable,
  ensureSettings,
  updateAmbience,
  updateCheckInSchedule,
  updateTheme,
} from './document-store';

export { ensureSettings, updateAmbience, updateCheckInSchedule, updateTheme };

export const loadSettings = async (): Promise<SettingsDocument | undefined> => {
  const document = await documentTable().get('settings');
  return document?.type === 'settings' && !document.deletedAt
    ? document
    : undefined;
};
