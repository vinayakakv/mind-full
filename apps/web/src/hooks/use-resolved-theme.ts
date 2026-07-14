import type { SettingsDocument } from '@mindfull/domain';
import { useEffect, useState } from 'react';

type ThemePreference = SettingsDocument['payload']['theme'];
type ResolvedTheme = Exclude<ThemePreference, 'system'>;

const resolveTheme = (preference: ThemePreference): ResolvedTheme => {
  if (preference !== 'system') {
    return preference;
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
};

export const useResolvedTheme = (preference: ThemePreference): void => {
  const [resolvedTheme, setResolvedTheme] = useState(() =>
    resolveTheme(preference),
  );

  useEffect(() => {
    const colorScheme = window.matchMedia('(prefers-color-scheme: dark)');
    const updateResolvedTheme = () =>
      setResolvedTheme(resolveTheme(preference));

    updateResolvedTheme();
    colorScheme.addEventListener('change', updateResolvedTheme);

    return () => colorScheme.removeEventListener('change', updateResolvedTheme);
  }, [preference]);

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
  }, [resolvedTheme]);
};
