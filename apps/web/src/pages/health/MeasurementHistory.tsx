import {
  type BodyMeasurementDocument,
  type BodyMetricDocument,
  formatBodyValue,
  latestBodyMeasurements,
} from '@mindfull/domain';
import { useState } from 'react';
import { Button } from 'react-aria-components';

import { deleteBodyMeasurement } from '../../data/health';
import styles from '../HealthPage.module.css';
import { formatTimestamp } from './health-format';
import { MeasurementDialog } from './MeasurementDialog';

export function MeasurementHistory({
  metric,
  measurements,
}: {
  metric: BodyMetricDocument;
  measurements: BodyMeasurementDocument[];
}) {
  const [editing, setEditing] = useState<BodyMeasurementDocument | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const entries = latestBodyMeasurements(measurements, metric.id);

  return (
    <section
      className={styles.history}
      aria-labelledby="measurement-history-heading"
    >
      <h2 id="measurement-history-heading">Measurements</h2>
      {entries.length ? (
        <ol>
          {entries.map((measurement) => (
            <li key={measurement.id}>
              <div className={styles.measurementSummary}>
                <strong>
                  {formatBodyValue(
                    measurement.payload.value,
                    metric.payload.preferredUnit,
                  )}
                </strong>
                <span>
                  {formatTimestamp(
                    measurement.occurredAt ?? measurement.createdAt,
                  )}
                </span>
              </div>
              {deletingId === measurement.id ? (
                <div className={styles.rowActions}>
                  <span>Delete?</span>
                  <Button
                    className={styles.deleteButton}
                    onPress={() => deleteBodyMeasurement(measurement.id)}
                  >
                    Delete
                  </Button>
                  <Button
                    className={styles.textButton}
                    onPress={() => setDeletingId(null)}
                  >
                    Keep
                  </Button>
                </div>
              ) : (
                <div className={styles.rowActions}>
                  <Button
                    className={styles.textButton}
                    onPress={() => setEditing(measurement)}
                  >
                    Edit
                  </Button>
                  <Button
                    className={styles.textButton}
                    onPress={() => setDeletingId(measurement.id)}
                  >
                    Delete
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ol>
      ) : (
        <p className={styles.emptyHistory}>No measurements yet.</p>
      )}
      {editing ? (
        <MeasurementDialog
          metrics={[metric]}
          measurements={measurements}
          initialMetricId={metric.id}
          measurement={editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </section>
  );
}
