import {
  type BodyMeasurementDocument,
  type BodyMetricDocument,
  changeFromPreviousMeasurement,
  displayedBodyValue,
  formatBodyValue,
  latestBodyMeasurements,
} from '@mindfull/domain';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router';

import { documentTable } from '../data/documents';
import styles from './HealthCard.module.css';

const formatChange = (
  canonicalChange: number,
  metric: BodyMetricDocument,
): string => {
  const change = displayedBodyValue(
    canonicalChange,
    metric.payload.preferredUnit,
  );
  const sign = change > 0 ? '+' : '';
  return `${sign}${new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 2,
  }).format(change)} ${metric.payload.preferredUnit}`;
};

export function HealthCard() {
  const health = useLiveQuery(async () => {
    const documents = await documentTable().toArray();
    const metrics = documents.filter(
      (document): document is BodyMetricDocument =>
        document.type === 'body-metric' && !document.deletedAt,
    );
    const measurements = documents.filter(
      (document): document is BodyMeasurementDocument =>
        document.type === 'body-measurement' && !document.deletedAt,
    );
    const latest = latestBodyMeasurements(measurements)[0];
    const metric = latest
      ? metrics.find(({ id }) => id === latest.payload.metricId)
      : undefined;

    return { latest, metric, measurements };
  }, []);

  const change = health?.metric
    ? changeFromPreviousMeasurement(health.measurements, health.metric.id)
    : null;

  return (
    <Link className={styles.card} to="/health">
      <span className={styles.icon} aria-hidden="true">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M7 4v16M17 4v16M4 8h6M14 8h6M4 16h6M14 16h6M10 6v4M14 6v4M10 14v4M14 14v4" />
        </svg>
      </span>
      <span className={styles.copy}>
        <span className={styles.eyebrow}>Health</span>
        {health?.latest && health.metric ? (
          <strong>
            {health.metric.payload.name} ·{' '}
            {formatBodyValue(
              health.latest.payload.value,
              health.metric.payload.preferredUnit,
            )}
          </strong>
        ) : (
          <strong>Notice change over time</strong>
        )}
        <span className={styles.detail}>
          {change !== null && health?.metric
            ? `${formatChange(change, health.metric)} from the previous reading`
            : 'A quiet record of body measurements'}
        </span>
      </span>
      <span aria-hidden="true">→</span>
    </Link>
  );
}
