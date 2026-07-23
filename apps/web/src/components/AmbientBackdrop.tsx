import type { SettingsDocument } from '@mindfull/domain';
import styles from './AmbientBackdrop.module.css';
import { ambientSceneFor } from './ambient-scene';

type AmbientBackdropProps = {
  mode: SettingsDocument['payload']['ambience'];
  now: Date;
};

export function AmbientBackdrop({ mode, now }: AmbientBackdropProps) {
  if (mode === 'off') return null;

  const scene = ambientSceneFor(now);

  return (
    <div
      className={styles.backdrop}
      data-composition={scene.composition}
      data-harmony={scene.harmony}
      data-motion={mode}
      data-phase={scene.phase}
      aria-hidden="true"
    >
      <div className={`${styles.fieldGroup} ${styles.fieldGroupOne}`} />
      <div className={`${styles.fieldGroup} ${styles.fieldGroupTwo}`} />
      <div className={`${styles.fieldGroup} ${styles.fieldGroupThree}`} />
      <div className={styles.grain} />
    </div>
  );
}
