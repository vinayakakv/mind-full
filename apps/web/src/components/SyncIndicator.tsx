import { useAtomValue } from 'jotai';

import { syncStatusAtom } from '../state/sync';
import styles from './SyncIndicator.module.css';

const labels = {
  idle: 'Synced',
  syncing: 'Syncing',
  offline: 'Offline',
  unpaired: 'Local only',
  error: 'Sync waiting',
} as const;

export function SyncIndicator() {
  const status = useAtomValue(syncStatusAtom);

  return (
    <span className={styles.status} data-status={status} aria-live="polite">
      <span aria-hidden="true" />
      {labels[status]}
    </span>
  );
}
