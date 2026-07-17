import { describe, expect, it } from 'vitest';

import { convertStoicExport, journalTitleAndBody } from './stoic-import.js';

const timestamp = Date.parse('2026-07-17T07:30:00.000Z');

describe('Stoic import', () => {
  it('uses Stoic heading attribution for a journal title and body', () => {
    expect(
      journalTitleAndBody({
        text: 'A quiet morning\nI noticed the light before starting work.',
        attributedText: {
          runs: [
            {
              text: 'A quiet morning',
              attributes: {
                blockPresentation: {
                  components: [{ type: 'header', level: 1 }],
                },
              },
            },
            { text: '\n' },
            { text: 'I noticed the light before starting work.' },
          ],
        },
      }),
    ).toEqual({
      title: 'A quiet morning',
      body: 'I noticed the light before starting work.',
    });
  });

  it('keeps an oversized first line as journal content', () => {
    const longLine = 'A long reflection. '.repeat(20).trim();
    const result = convertStoicExport(
      {
        manifest: {},
        questions: [],
        routines: [],
        answers: [],
        journals: [
          {
            uuid: 'long-journal',
            timestamp,
            calendarDate: '17/07/2026',
            text: `${longLine}\n`,
            answers: [],
          },
        ],
      },
      { timezone: 'Asia/Kolkata' },
    );

    expect(result.documents[0]?.payload).toMatchObject({
      title: 'Journal',
      markdown: longLine,
    });
  });

  it('creates additive journals and merges a daily check-in into its routine', () => {
    const result = convertStoicExport(
      {
        manifest: { appVersion: '2025.18', os: 'Android' },
        questions: [],
        journals: [
          {
            uuid: 'journal-1',
            timestamp,
            calendarDate: '17/07/2026',
            text: 'A quiet morning\nI noticed the light.',
            attributedText: {
              runs: [
                {
                  text: 'A quiet morning',
                  attributes: {
                    blockPresentation: {
                      components: [{ type: 'header', level: 1 }],
                    },
                  },
                },
                { text: '\n' },
                { text: 'I noticed the light.' },
              ],
            },
            answers: [],
          },
          {
            uuid: 'daily-1',
            timestamp: timestamp + 60_000,
            calendarDate: '17/07/2026',
            template: '3ddd4e33-5c74-401a-a293-eed747d889ba',
            text: '',
            answers: ['rested-answer', 'focus-answer'],
          },
        ],
        routines: [
          {
            uuid: 'morning-1',
            timestamp,
            type: 'morning',
            date: '17/07/2026',
            answers: ['mood-answer', 'gratitude-answer'],
          },
          {
            uuid: 'afternoon-1',
            timestamp: timestamp + 120_000,
            type: 'afternoon',
            date: '17/07/2026',
            answers: ['afternoon-answer'],
          },
        ],
        answers: [
          {
            uuid: 'mood-answer',
            question: '14e2ee8a-6ba0-4429-ad65-b930658a367c',
            timestamp,
            text: '3',
          },
          {
            uuid: 'gratitude-answer',
            question: 'a29747df-f2a6-4fdc-8f2e-b1a5459b6205',
            timestamp,
            text: 'Time to reflect.',
          },
          {
            uuid: 'rested-answer',
            question: '01ae8ffb-6f03-4826-a8e1-76b0f18049b1',
            timestamp: timestamp + 60_000,
            text: '3',
          },
          {
            uuid: 'focus-answer',
            question: 'ffec5c36-d6f0-40ac-ae9a-3ad08f7d69db',
            timestamp: timestamp + 60_000,
            text: '13108b96-6906-4a7d-a847-9122b0cee06f,79e74929-8f56-4e97-b43e-7941f46739d1',
          },
          {
            uuid: 'afternoon-answer',
            question: 'afternoon-question',
            timestamp: timestamp + 120_000,
            text: 'A quiet pause.',
          },
        ],
      },
      { timezone: 'Asia/Kolkata' },
    );

    expect(result.counts).toEqual({
      journals: 1,
      checkIns: 1,
      skippedRoutines: 1,
      skippedAnswers: 0,
      skippedDocuments: 0,
    });
    expect(result.documents.map((document) => document.id)).toEqual([
      'stoic:journal:journal-1',
      'stoic:check-in:morning-1',
    ]);

    const journal = result.documents.find(
      (document) => document.type === 'journal',
    );
    expect(journal?.payload).toMatchObject({
      title: 'A quiet morning',
      markdown: 'I noticed the light.',
      localDate: '2026-07-17',
      status: 'completed',
    });

    const checkIn = result.documents.find(
      (document) => document.type === 'check-in',
    );
    expect(checkIn?.payload).toMatchObject({
      kind: 'morning',
      mood: 'Good',
      localDate: '2026-07-17',
      status: 'completed',
      responses: [
        {
          promptText: 'What are you grateful for?',
          answer: 'Time to reflect.',
        },
        { promptText: 'How rested do you feel?', answer: 'Well rested' },
        {
          promptText: 'What deserves your focus today?',
          answer: 'Work, Family',
        },
      ],
    });
    expect(result.warnings).toEqual([]);
  });

  it('omits answers and documents whose labels are unavailable', () => {
    const result = convertStoicExport(
      {
        manifest: {},
        questions: [],
        journals: [
          {
            uuid: 'unknown-journal',
            timestamp,
            calendarDate: '17/07/2026',
            template: 'unknown-template',
            text: '',
            answers: ['unknown-journal-answer'],
          },
        ],
        routines: [
          {
            uuid: 'mixed-check-in',
            timestamp,
            type: 'morning',
            date: '17/07/2026',
            answers: ['known-answer', 'unknown-answer', 'opaque-answer'],
          },
        ],
        answers: [
          {
            uuid: 'unknown-journal-answer',
            question: 'unknown-journal-question',
            timestamp,
            text: 'An answer without its prompt.',
          },
          {
            uuid: 'known-answer',
            question: 'a29747df-f2a6-4fdc-8f2e-b1a5459b6205',
            timestamp,
            text: 'A quiet morning.',
          },
          {
            uuid: 'unknown-answer',
            question: '3542e84f-3b8e-4172-85fc-426ded6ade90',
            timestamp,
            text: 'An answer without its prompt.',
          },
          {
            uuid: 'opaque-answer',
            question: 'ffec5c36-d6f0-40ac-ae9a-3ad08f7d69db',
            timestamp,
            text: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          },
        ],
      },
      { timezone: 'Asia/Kolkata' },
    );

    expect(result.documents).toHaveLength(1);
    expect(result.documents[0]?.payload).toMatchObject({
      responses: [
        {
          promptText: 'What are you grateful for?',
          answer: 'A quiet morning.',
        },
      ],
    });
    expect(result.counts).toEqual({
      journals: 0,
      checkIns: 1,
      skippedRoutines: 0,
      skippedAnswers: 3,
      skippedDocuments: 1,
    });
    expect(result.warnings).toEqual([
      'Question 3542e84f-3b8e-4172-85fc-426ded6ade90 has no exported label.',
      'Question ffec5c36-d6f0-40ac-ae9a-3ad08f7d69db contains choice IDs without exported labels.',
      'Question unknown-journal-question has no exported label.',
    ]);
  });

  it('gives known Stoic wellbeing ratings readable labels', () => {
    const result = convertStoicExport(
      {
        manifest: {},
        questions: [],
        journals: [],
        routines: [
          {
            uuid: 'morning-ratings',
            timestamp,
            type: 'morning',
            date: '17/07/2026',
            answers: ['sleep', 'motivation', 'day', 'good-day'],
          },
        ],
        answers: [
          {
            uuid: 'sleep',
            question: 'f896b5df-08a0-44f5-aec8-36fafcc4c9c2',
            timestamp,
            text: '2',
          },
          {
            uuid: 'motivation',
            question: 'dd8b7043-baad-46f2-a6ca-fb64852eaae8',
            timestamp,
            text: '3',
          },
          {
            uuid: 'day',
            question: 'ff4855f1-fa40-42d3-b403-dcb00fabeb40',
            timestamp,
            text: '2',
          },
          {
            uuid: 'good-day',
            question: '8b5b787d-d8d8-4d43-bfbc-cc7062ac3d04',
            timestamp,
            text: '1',
          },
        ],
      },
      { timezone: 'Asia/Kolkata' },
    );
    const checkIn = result.documents.find(
      (document) => document.type === 'check-in',
    );

    expect(checkIn?.payload.responses).toMatchObject([
      { answer: 'Okay' },
      { answer: 'Motivated' },
      { answer: 'Okay' },
      { answer: 'Yes' },
    ]);
  });
});
