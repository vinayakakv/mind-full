import { atom } from 'jotai';

export type AiStatus =
  | 'not-configured'
  | 'checking'
  | 'available'
  | 'unavailable'
  | 'invalid-configuration'
  | 'paused';

export const aiStatusAtom = atom<AiStatus>('not-configured');
