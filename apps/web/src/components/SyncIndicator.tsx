import { useAtomValue } from 'jotai';

import { syncStatusAtom, syncStatusLabels } from '../state/sync';
import styles from './SyncIndicator.module.css';

export function SyncIndicator() {
  const status = useAtomValue(syncStatusAtom);

  return (
    <span className={styles.status} data-status={status} aria-live="polite">
      <span aria-hidden="true" />
      {syncStatusLabels[status]}
    </span>
  );
}
