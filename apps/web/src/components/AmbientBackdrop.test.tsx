import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AmbientBackdrop } from './AmbientBackdrop';

describe('ambient backdrop', () => {
  it('keeps the selected local scene stable in its presentation attributes', () => {
    const { container } = render(
      <AmbientBackdrop mode="still" now={new Date(2026, 6, 23, 18, 30)} />,
    );
    const backdrop = container.firstElementChild;

    expect(backdrop?.getAttribute('data-motion')).toBe('still');
    expect(backdrop?.getAttribute('data-phase')).toBe('dusk');
    expect(backdrop?.getAttribute('data-composition')).toBe('3');
    expect(backdrop?.getAttribute('data-harmony')).toBe('4');
  });

  it('removes decorative ambience when it is off', () => {
    const { container } = render(
      <AmbientBackdrop mode="off" now={new Date(2026, 6, 23, 18, 30)} />,
    );

    expect(container.childElementCount).toBe(0);
  });
});
