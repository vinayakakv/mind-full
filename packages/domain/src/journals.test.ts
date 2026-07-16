import { describe, expect, it } from 'vitest';

import { journalBody, journalHeading } from './journals.js';

const entry = {
  title: null,
  markdown: '',
  localDate: '2026-07-14',
  timezone: 'Asia/Kolkata',
  status: 'completed' as const,
  completedAt: '2026-07-14T12:00:00.000Z',
};

describe('journal heading', () => {
  it('prefers a title and otherwise uses the first written line', () => {
    expect(journalHeading({ ...entry, title: 'A quiet day' }, '14 July')).toBe(
      'A quiet day',
    );
    expect(
      journalHeading(
        { ...entry, markdown: '\n# The evening sky\nwas violet.' },
        '14 July',
      ),
    ).toBe('The evening sky');
  });

  it('uses the date for an empty entry', () => {
    expect(journalHeading(entry, '14 July')).toBe('14 July');
  });

  it('uses an untitled first line as the heading rather than repeating it', () => {
    expect(
      journalBody({
        ...entry,
        markdown: '# The evening sky\n\nThe light stayed a little longer.',
      }),
    ).toBe('The light stayed a little longer.');
    expect(
      journalBody({ ...entry, title: 'Evening', markdown: 'The whole entry.' }),
    ).toBe('The whole entry.');
  });
});
