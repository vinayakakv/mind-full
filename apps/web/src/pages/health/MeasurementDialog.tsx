import {
  type BodyMeasurementDocument,
  type BodyMetricDocument,
  displayedBodyValue,
  latestBodyMeasurements,
} from '@mindfull/domain';
import { useState } from 'react';
import { Button, Form, Input, Label, TextField } from 'react-aria-components';

import { ActionDialog } from '../../components/ui/ActionDialog';
import { addBodyMeasurement, updateBodyMeasurement } from '../../data/health';
import styles from '../HealthPage.module.css';

export function MeasurementDialog({
  metrics,
  measurements,
  initialMetricId,
  measurement,
  onClose,
}: {
  metrics: BodyMetricDocument[];
  measurements: BodyMeasurementDocument[];
  initialMetricId: string;
  measurement?: BodyMeasurementDocument;
  onClose: () => void;
}) {
  const startingMetricId = measurement?.payload.metricId ?? initialMetricId;
  const valueForMetric = (metricId: string): string => {
    const selectedMetric = metrics.find(({ id }) => id === metricId);
    const latest = latestBodyMeasurements(measurements, metricId)[0];
    if (!selectedMetric || !latest) return '';

    return displayedBodyValue(
      latest.payload.value,
      selectedMetric.payload.preferredUnit,
    ).toString();
  };
  const [metricId, setMetricId] = useState(startingMetricId);
  const metric = metrics.find(({ id }) => id === metricId) ?? metrics[0];
  const initialValue =
    measurement && metric
      ? displayedBodyValue(
          measurement.payload.value,
          metric.payload.preferredUnit,
        ).toString()
      : valueForMetric(startingMetricId);
  const [value, setValue] = useState(initialValue);
  const numericValue = Number(value);
  const hasValidPrecision = /^\d+(\.\d{1,2})?$/.test(value);
  const canSave = Boolean(metric && numericValue > 0 && hasValidPrecision);

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!metric || !canSave) return;

    if (measurement) await updateBodyMeasurement(measurement.id, numericValue);
    else await addBodyMeasurement(metric.id, numericValue);
    onClose();
  };

  return (
    <ActionDialog
      eyebrow="Body measurement"
      title={measurement ? 'Edit entry' : 'Add measurement'}
      onClose={onClose}
    >
      <Form className={styles.measurementForm} onSubmit={save}>
        <label className={styles.nativeField}>
          <span>Metric</span>
          <select
            aria-label="Metric"
            value={metric?.id ?? ''}
            disabled={Boolean(measurement)}
            onChange={(event) => {
              const nextMetricId = event.currentTarget.value;
              setMetricId(nextMetricId);
              setValue(valueForMetric(nextMetricId));
            }}
          >
            {metrics.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.payload.name}
              </option>
            ))}
          </select>
        </label>
        <TextField value={value} onChange={setValue} isRequired autoFocus>
          <Label>Value</Label>
          <div className={styles.valueField}>
            <Input type="number" min="0.01" step="0.01" inputMode="decimal" />
            <span>{metric?.payload.preferredUnit}</span>
          </div>
        </TextField>
        {value && !canSave ? (
          <p className={styles.error}>
            Enter a positive value with up to two decimals.
          </p>
        ) : null}
        <div className={styles.formActions}>
          <Button
            className={styles.primaryButton}
            type="submit"
            isDisabled={!canSave}
          >
            {measurement ? 'Save changes' : 'Save measurement'}
          </Button>
          <Button className={styles.textButton} onPress={onClose}>
            Cancel
          </Button>
        </div>
      </Form>
    </ActionDialog>
  );
}
