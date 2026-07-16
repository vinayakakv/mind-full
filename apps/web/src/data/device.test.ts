import { describe, expect, it } from 'vitest';

import { createDeviceId } from './device';

describe('device identity', () => {
  it('creates a UUID from random bytes when randomUUID is unavailable', () => {
    const deviceId = createDeviceId({
      randomBytes: () => Uint8Array.from({ length: 16 }, (_, index) => index),
    });

    expect(deviceId).toBe('00010203-0405-4607-8809-0a0b0c0d0e0f');
  });
});
