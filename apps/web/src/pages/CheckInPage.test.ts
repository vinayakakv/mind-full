import { describe, expect, it } from 'vitest';

import { checkInPageHeading } from './CheckInPage';

describe('check-in page heading', () => {
  it('uses this for today and a stable title for past entries', () => {
    expect(checkInPageHeading('morning', '2026-07-16', '2026-07-16')).toBe(
      'This morning',
    );
    expect(checkInPageHeading('evening', '2026-07-16', '2026-07-16')).toBe(
      'This evening',
    );
    expect(checkInPageHeading('morning', '2026-07-15', '2026-07-16')).toBe(
      'Morning check-in',
    );
    expect(checkInPageHeading('evening', '2026-07-15', '2026-07-16')).toBe(
      'Evening check-in',
    );
  });
});
