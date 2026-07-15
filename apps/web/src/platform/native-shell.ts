import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';

type AppTheme = 'light' | 'dark';

export const applyNativeTheme = async (theme: AppTheme): Promise<void> => {
  if (!Capacitor.isNativePlatform()) return;

  await SystemBars.setStyle({
    style: theme === 'dark' ? SystemBarsStyle.Dark : SystemBarsStyle.Light,
  });
};

export const deviceName = (): string =>
  Capacitor.isNativePlatform() ? 'Android' : 'This browser';
