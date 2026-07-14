import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';

import type { MindfullDatabase } from './database/database.js';
import { devices } from './database/schema.js';

const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

export const matchesSecret = (candidate: string, expected: string): boolean => {
  const candidateBytes = Buffer.from(candidate);
  const expectedBytes = Buffer.from(expected);

  return (
    candidateBytes.length === expectedBytes.length &&
    timingSafeEqual(candidateBytes, expectedBytes)
  );
};

export const pairDevice = (
  database: MindfullDatabase,
  deviceId: string,
  deviceName: string,
): string => {
  const token = randomBytes(32).toString('base64url');

  database
    .insert(devices)
    .values({
      id: deviceId,
      name: deviceName,
      tokenHash: hashToken(token),
      createdAt: new Date().toISOString(),
      revokedAt: null,
    })
    .onConflictDoUpdate({
      target: devices.id,
      set: {
        name: deviceName,
        tokenHash: hashToken(token),
        revokedAt: null,
      },
    })
    .run();

  return token;
};

export const authenticatedDeviceId = (
  database: MindfullDatabase,
  request: FastifyRequest,
): string | null => {
  const authorization = request.headers.authorization;

  if (!authorization?.startsWith('Bearer ')) {
    return null;
  }

  const token = authorization.slice('Bearer '.length);
  const device = database
    .select()
    .from(devices)
    .where(eq(devices.tokenHash, hashToken(token)))
    .get();

  return device && !device.revokedAt ? device.id : null;
};
