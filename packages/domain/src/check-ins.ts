import type { CheckInPayload } from './documents.js';

export type CheckInKind = CheckInPayload['kind'];

export type CuratedPrompt = {
  id: string;
  text: string;
  intention: 'appreciate' | 'acknowledge' | 'focus' | 'release';
};

const morningPromptGroups = [
  [
    {
      id: 'morning-appreciate-present',
      text: 'What is one good thing already present?',
      intention: 'appreciate',
    },
    {
      id: 'morning-appreciate-nearby',
      text: 'What is supporting you this morning?',
      intention: 'appreciate',
    },
    {
      id: 'morning-appreciate-small',
      text: 'What small thing can you appreciate right now?',
      intention: 'appreciate',
    },
  ],
  [
    {
      id: 'morning-acknowledge-hard',
      text: 'What may feel difficult today?',
      intention: 'acknowledge',
    },
    {
      id: 'morning-acknowledge-weight',
      text: 'Is there anything weighing on you this morning?',
      intention: 'acknowledge',
    },
    {
      id: 'morning-acknowledge-kindness',
      text: 'What could you be kinder to yourself about today?',
      intention: 'acknowledge',
    },
  ],
  [
    {
      id: 'morning-focus-worthy',
      text: 'What deserves your attention today?',
      intention: 'focus',
    },
    {
      id: 'morning-focus-enough',
      text: 'What would make today feel like enough?',
      intention: 'focus',
    },
    {
      id: 'morning-focus-carry',
      text: 'How would you like to move through today?',
      intention: 'focus',
    },
  ],
] as const satisfies readonly (readonly CuratedPrompt[])[];

const eveningPromptGroups = [
  [
    {
      id: 'evening-appreciate-well',
      text: 'What felt good or went well today?',
      intention: 'appreciate',
    },
    {
      id: 'evening-appreciate-warmth',
      text: 'What brought you a little comfort or joy today?',
      intention: 'appreciate',
    },
    {
      id: 'evening-appreciate-keep',
      text: 'What moment from today would you like to keep?',
      intention: 'appreciate',
    },
  ],
  [
    {
      id: 'evening-acknowledge-hard',
      text: 'What was difficult today?',
      intention: 'acknowledge',
    },
    {
      id: 'evening-acknowledge-drain',
      text: 'What took more from you than expected?',
      intention: 'acknowledge',
    },
    {
      id: 'evening-acknowledge-unsettled',
      text: 'What still feels unsettled?',
      intention: 'acknowledge',
    },
  ],
  [
    {
      id: 'evening-release-kind',
      text: 'What could you be gentler with yourself about?',
      intention: 'release',
    },
    {
      id: 'evening-release-enough',
      text: 'What did you do today that was enough?',
      intention: 'release',
    },
    {
      id: 'evening-release-set-down',
      text: 'What are you ready to set down for the night?',
      intention: 'release',
    },
  ],
  [
    {
      id: 'evening-focus-tomorrow',
      text: 'What matters tomorrow?',
      intention: 'focus',
    },
    {
      id: 'evening-focus-ease',
      text: 'What could make tomorrow a little easier?',
      intention: 'focus',
    },
    {
      id: 'evening-focus-remember',
      text: 'What from today would you like to carry into tomorrow?',
      intention: 'focus',
    },
  ],
] as const satisfies readonly (readonly CuratedPrompt[])[];

const dayNumber = (localDate: string): number => {
  const [year, month, day] = localDate.split('-').map(Number);
  return Math.floor(
    Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1) / 86_400_000,
  );
};

export const selectCuratedPrompts = (
  kind: CheckInKind,
  localDate: string,
): CuratedPrompt[] => {
  const groups = kind === 'morning' ? morningPromptGroups : eveningPromptGroups;
  const dateOffset = dayNumber(localDate);

  return groups.map((prompts, groupIndex) => {
    const promptIndex = (dateOffset + groupIndex) % prompts.length;
    return prompts[promptIndex] ?? prompts[0];
  });
};

export const relevantCheckInKind = (
  localTime: string,
  morningStartsAt: string,
  eveningStartsAt: string,
): CheckInKind => {
  const isMorning = localTime >= morningStartsAt && localTime < eveningStartsAt;
  return isMorning ? 'morning' : 'evening';
};

export const isCheckInScheduleValid = (
  morningStartsAt: string,
  eveningStartsAt: string,
): boolean => morningStartsAt < eveningStartsAt;
