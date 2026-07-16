import {
  type BodyMeasurementDocument,
  type BodyMetricDocument,
  changeFromPreviousMeasurement,
  formatBodyValue,
  latestBodyMeasurements,
} from '@mindfull/domain';
import { Button } from 'react-aria-components';

import styles from '../HealthPage.module.css';
import { formatChange } from './health-format';

export function HealthOverview({
  metrics,
  measurements,
  selectedId,
  onSelect,
}: {
  metrics: BodyMetricDocument[];
  measurements: BodyMeasurementDocument[];
  selectedId: string;
  onSelect: (metricId: string) => void;
}) {
  return (
    <section className={styles.overview} aria-label="Body metric overview">
      {metrics.map((metric) => {
        const latest = latestBodyMeasurements(measurements, metric.id)[0];
        const change = changeFromPreviousMeasurement(measurements, metric.id);

        return (
          <Button
            key={metric.id}
            className={styles.metricCard}
            aria-pressed={selectedId === metric.id}
            onPress={() => onSelect(metric.id)}
          >
            <span>{metric.payload.name}</span>
            <strong>
              {latest
                ? formatBodyValue(
                    latest.payload.value,
                    metric.payload.preferredUnit,
                  )
                : 'No entries'}
            </strong>
            {change === null ? null : (
              <small>{`${formatChange(change, metric.payload.preferredUnit)} from previous`}</small>
            )}
          </Button>
        );
      })}
    </section>
  );
}
