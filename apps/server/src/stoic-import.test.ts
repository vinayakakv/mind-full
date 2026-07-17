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
            answers: ['rested-answer'],
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
        ],
      },
      { timezone: 'Asia/Kolkata' },
    );

    expect(result.counts).toEqual({ journals: 1, checkIns: 1 });
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
        { promptText: 'How rested do you feel?', answer: '3' },
      ],
    });
  });
});
