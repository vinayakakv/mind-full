import type { SettingsDocument } from '@mindfull/domain';

import styles from './AmbientBackdrop.module.css';

type AmbientBackdropProps = {
  mode: SettingsDocument['payload']['ambience'];
  period: 'morning' | 'evening';
};

export function AmbientBackdrop({ mode, period }: AmbientBackdropProps) {
  if (mode === 'off') return null;

  return (
    <div
      className={styles.backdrop}
      data-motion={mode}
      data-period={period}
      aria-hidden="true"
    />
  );
}
