const deviceIdKey = 'mindfull.device-id';

type DeviceIdSource = {
  randomUUID?: () => string;
  randomBytes: (length: number) => Uint8Array;
};

const browserDeviceIdSource = (): DeviceIdSource => {
  const randomBytes = (length: number) =>
    globalThis.crypto.getRandomValues(new Uint8Array(length));

  return typeof globalThis.crypto.randomUUID === 'function'
    ? { randomUUID: () => globalThis.crypto.randomUUID(), randomBytes }
    : { randomBytes };
};

export const createDeviceId = (
  source: DeviceIdSource = browserDeviceIdSource(),
): string => {
  if (source.randomUUID) return source.randomUUID();

  const bytes = source.randomBytes(16).map((byte, index) => {
    if (index === 6) return (byte & 0x0f) | 0x40;
    if (index === 8) return (byte & 0x3f) | 0x80;
    return byte;
  });
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'));

  return [
    hex.slice(0, 4),
    hex.slice(4, 6),
    hex.slice(6, 8),
    hex.slice(8, 10),
    hex.slice(10),
  ]
    .map((part) => part.join(''))
    .join('-');
};

export const getDeviceId = (): string => {
  const storedDeviceId = window.localStorage.getItem(deviceIdKey);

  if (storedDeviceId) {
    return storedDeviceId;
  }

  const deviceId = createDeviceId();
  window.localStorage.setItem(deviceIdKey, deviceId);
  return deviceId;
};
