const deviceIdKey = 'mindfull.device-id';

export const getDeviceId = (): string => {
  const storedDeviceId = window.localStorage.getItem(deviceIdKey);

  if (storedDeviceId) {
    return storedDeviceId;
  }

  const deviceId = crypto.randomUUID();
  window.localStorage.setItem(deviceIdKey, deviceId);
  return deviceId;
};
