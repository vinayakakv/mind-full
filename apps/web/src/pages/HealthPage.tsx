import {
  type BodyMeasurementDocument,
  type BodyMetricDocument,
  type BodyMetricKind,
  type BodyUnit,
  changeFromPreviousMeasurement,
  displayedBodyValue,
  formatBodyValue,
  type HealthRange,
  latestBodyMeasurements,
  measurementsInHealthRange,
  unitsForBodyMetric,
} from '@mindfull/domain';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import {
  Button,
  Dialog,
  Form,
  Heading,
  Input,
  Label,
  Modal,
  ModalOverlay,
  TextField,
} from 'react-aria-components';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import {
  addBodyMeasurement,
  createBodyMetric,
  deleteBodyMeasurement,
  documentTable,
  ensureDefaultBodyMetrics,
  setBodyMetricArchived,
  updateBodyMeasurement,
  updateBodyMetric,
} from '../data/documents';
import styles from './HealthPage.module.css';

const healthRanges: Array<{ value: HealthRange; label: string }> = [
  { value: '1m', label: '1 month' },
  { value: '3m', label: '3 months' },
  { value: '6m', label: '6 months' },
  { value: '1y', label: '1 year' },
  { value: 'all', label: 'All' },
];

const loadHealth = async (): Promise<{
  metrics: BodyMetricDocument[];
  measurements: BodyMeasurementDocument[];
}> => {
  const [metricDocuments, measurementDocuments] = await Promise.all([
    documentTable().where('type').equals('body-metric').toArray(),
    documentTable().where('type').equals('body-measurement').toArray(),
  ]);
  const metrics = metricDocuments
    .filter(
      (document): document is BodyMetricDocument =>
        document.type === 'body-metric' && !document.deletedAt,
    )
    .sort(
      (left, right) =>
        (left.sortKey ?? '').localeCompare(right.sortKey ?? '') ||
        left.payload.name.localeCompare(right.payload.name),
    );
  const measurements = measurementDocuments.filter(
    (document): document is BodyMeasurementDocument =>
      document.type === 'body-measurement' && !document.deletedAt,
  );
  return { metrics, measurements };
};

const formatTimestamp = (timestamp: string): string =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(timestamp));

const formatShortDate = (timestamp: number): string =>
  new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
  }).format(new Date(timestamp));

const formatChange = (change: number, unit: BodyUnit): string => {
  const displayed = displayedBodyValue(change, unit);
  const sign = displayed > 0 ? '+' : '';
  return `${sign}${new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 2,
  }).format(displayed)} ${unit}`;
};

function HealthOverview({
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

function MeasurementDialog({
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
    <ModalOverlay
      className={styles.modalOverlay}
      isOpen
      isDismissable
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <Modal className={styles.modal}>
        <Dialog className={styles.dialog}>
          <div className={styles.dialogHeading}>
            <div>
              <p>Body measurement</p>
              <Heading slot="title">
                {measurement ? 'Edit entry' : 'Add measurement'}
              </Heading>
            </div>
            <Button
              className={styles.closeButton}
              aria-label="Close"
              onPress={onClose}
            >
              ×
            </Button>
          </div>
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
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  inputMode="decimal"
                />
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
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}

function MetricRow({ metric }: { metric: BodyMetricDocument }) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(metric.payload.name);
  const [unit, setUnit] = useState<BodyUnit>(metric.payload.preferredUnit);

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) return;
    await updateBodyMetric(metric.id, {
      name: name.trim(),
      preferredUnit: unit,
    });
    setIsEditing(false);
  };

  if (metric.payload.archivedAt) {
    return (
      <li className={styles.archivedMetric}>
        <span>{metric.payload.name}</span>
        <Button
          className={styles.textButton}
          onPress={() => setBodyMetricArchived(metric.id, false)}
        >
          Restore
        </Button>
      </li>
    );
  }

  return (
    <li className={styles.metricRow}>
      {isEditing ? (
        <Form className={styles.metricEditForm} onSubmit={save}>
          <TextField value={name} onChange={setName} isRequired>
            <Label>Name</Label>
            <Input maxLength={100} />
          </TextField>
          <label className={styles.nativeField}>
            <span>Preferred unit</span>
            <select
              aria-label={`Preferred unit for ${metric.payload.name}`}
              value={unit}
              onChange={(event) =>
                setUnit(event.currentTarget.value as BodyUnit)
              }
            >
              {unitsForBodyMetric(metric.payload.kind).map((candidate) => (
                <option key={candidate} value={candidate}>
                  {candidate}
                </option>
              ))}
            </select>
          </label>
          <div className={styles.formActions}>
            <Button className={styles.smallButton} type="submit">
              Save
            </Button>
            <Button
              className={styles.textButton}
              onPress={() => setIsEditing(false)}
            >
              Cancel
            </Button>
          </div>
        </Form>
      ) : (
        <>
          <div className={styles.metricSummary}>
            <strong>{metric.payload.name}</strong>
            <span>{metric.payload.preferredUnit}</span>
          </div>
          <div className={styles.rowActions}>
            <Button
              className={styles.textButton}
              onPress={() => setIsEditing(true)}
            >
              Edit
            </Button>
            <Button
              className={styles.archiveButton}
              onPress={() => setBodyMetricArchived(metric.id, true)}
            >
              Archive
            </Button>
          </div>
        </>
      )}
    </li>
  );
}

function MetricManager({
  metrics,
  onClose,
}: {
  metrics: BodyMetricDocument[];
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<BodyMetricKind>('circumference');
  const [showArchived, setShowArchived] = useState(false);
  const preferredUnit = kind === 'mass' ? 'kg' : 'cm';
  const visibleMetrics = metrics.filter(
    ({ payload }) => showArchived || !payload.archivedAt,
  );

  const addMetric = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) return;
    await createBodyMetric(name.trim(), kind, preferredUnit);
    setName('');
  };

  return (
    <ModalOverlay
      className={styles.modalOverlay}
      isOpen
      isDismissable
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <Modal className={`${styles.modal} ${styles.managerModal}`}>
        <Dialog className={styles.dialog}>
          <div className={styles.dialogHeading}>
            <div>
              <p>Your measures</p>
              <Heading slot="title">Body metrics</Heading>
            </div>
            <Button
              className={styles.closeButton}
              aria-label="Close metric manager"
              onPress={onClose}
            >
              ×
            </Button>
          </div>
          <ul className={styles.metricList}>
            {visibleMetrics.map((metric) => (
              <MetricRow key={metric.id} metric={metric} />
            ))}
          </ul>
          <Button
            className={styles.showArchivedButton}
            aria-pressed={showArchived}
            onPress={() => setShowArchived((shown) => !shown)}
          >
            {showArchived ? 'Hide archived' : 'Show archived'}
          </Button>
          <Form className={styles.newMetricForm} onSubmit={addMetric}>
            <h3>Add a custom metric</h3>
            <TextField value={name} onChange={setName} isRequired>
              <Label>Name</Label>
              <Input placeholder="Neck" maxLength={100} />
            </TextField>
            <label className={styles.nativeField}>
              <span>Kind</span>
              <select
                aria-label="Metric kind"
                value={kind}
                onChange={(event) =>
                  setKind(event.currentTarget.value as BodyMetricKind)
                }
              >
                <option value="circumference">Circumference · cm</option>
                <option value="mass">Mass · kg</option>
              </select>
            </label>
            <Button
              className={styles.smallButton}
              type="submit"
              isDisabled={!name.trim()}
            >
              Add metric
            </Button>
          </Form>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}

function HealthChart({
  metric,
  measurements,
  range,
}: {
  metric: BodyMetricDocument;
  measurements: BodyMeasurementDocument[];
  range: HealthRange;
}) {
  const ranged = measurementsInHealthRange(measurements, new Date(), range);
  const chartData = ranged.map((measurement) => ({
    recordedAt: new Date(
      measurement.occurredAt ?? measurement.createdAt,
    ).getTime(),
    value: displayedBodyValue(
      measurement.payload.value,
      metric.payload.preferredUnit,
    ),
  }));

  if (!chartData.length) {
    return <p className={styles.chartEmpty}>Measurements will gather here.</p>;
  }

  return (
    <div
      className={styles.chart}
      role="img"
      aria-label={`${metric.payload.name} measurements over the selected period`}
    >
      <ResponsiveContainer width="100%" height={270}>
        <LineChart
          data={chartData}
          margin={{ top: 14, right: 12, bottom: 4, left: -12 }}
          accessibilityLayer
        >
          <CartesianGrid vertical={false} stroke="var(--border-subtle)" />
          <XAxis
            dataKey="recordedAt"
            type="number"
            domain={['dataMin', 'dataMax']}
            tickFormatter={formatShortDate}
            stroke="var(--text-muted)"
            tickLine={false}
            axisLine={false}
            fontSize={11}
          />
          <YAxis
            domain={['auto', 'auto']}
            stroke="var(--text-muted)"
            tickLine={false}
            axisLine={false}
            fontSize={11}
            tickFormatter={(value: number) => `${value}`}
          />
          <Tooltip
            labelFormatter={(value) =>
              formatTimestamp(new Date(Number(value)).toISOString())
            }
            formatter={(value) => [
              `${value} ${metric.payload.preferredUnit}`,
              metric.payload.name,
            ]}
            contentStyle={{
              background: 'var(--surface-canvas)',
              border: '1px solid var(--border-control)',
              borderRadius: '0.65rem',
              color: 'var(--text-primary)',
              fontSize: '0.75rem',
            }}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke="var(--accent-strong)"
            strokeWidth={2}
            dot={{ r: 3, fill: 'var(--surface-canvas)', strokeWidth: 2 }}
            activeDot={{ r: 5 }}
            isAnimationActive="auto"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function MeasurementHistory({
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

export function HealthPage() {
  const health = useLiveQuery(loadHealth, []);
  const [selectedId, setSelectedId] = useState('body-metric:weight');
  const [range, setRange] = useState<HealthRange>('3m');
  const [isAdding, setIsAdding] = useState(false);
  const [isManaging, setIsManaging] = useState(false);

  useEffect(() => {
    void ensureDefaultBodyMetrics();
  }, []);
  const activeMetrics =
    health?.metrics.filter(({ payload }) => !payload.archivedAt) ?? [];
  const selectedMetric =
    activeMetrics.find(({ id }) => id === selectedId) ?? activeMetrics[0];
  const selectedMeasurements = selectedMetric
    ? (health?.measurements.filter(
        ({ payload }) => payload.metricId === selectedMetric.id,
      ) ?? [])
    : [];

  return (
    <section className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>Notice change gently</p>
          <h1>Health</h1>
          <p>Body measurements over time, without targets or judgment.</p>
        </div>
        <div className={styles.headerActions}>
          <Button
            className={styles.primaryButton}
            onPress={() => setIsAdding(true)}
            isDisabled={!activeMetrics.length}
          >
            Add measurement
          </Button>
          <Button
            className={styles.textButton}
            onPress={() => setIsManaging(true)}
          >
            Manage metrics
          </Button>
        </div>
      </header>

      {health && selectedMetric ? (
        <>
          <HealthOverview
            metrics={activeMetrics}
            measurements={health.measurements}
            selectedId={selectedMetric.id}
            onSelect={setSelectedId}
          />
          <section
            className={styles.trend}
            aria-labelledby="health-trend-heading"
          >
            <div className={styles.trendHeading}>
              <div>
                <p>Long view</p>
                <h2 id="health-trend-heading">{selectedMetric.payload.name}</h2>
              </div>
              <fieldset className={styles.rangeChoices}>
                <legend className="visually-hidden">Chart range</legend>
                {healthRanges.map((option) => (
                  <Button
                    key={option.value}
                    className={styles.rangeButton}
                    aria-pressed={range === option.value}
                    onPress={() => setRange(option.value)}
                  >
                    {option.label}
                  </Button>
                ))}
              </fieldset>
            </div>
            <HealthChart
              metric={selectedMetric}
              measurements={selectedMeasurements}
              range={range}
            />
          </section>
          <MeasurementHistory
            metric={selectedMetric}
            measurements={selectedMeasurements}
          />
        </>
      ) : null}

      {isAdding && selectedMetric ? (
        <MeasurementDialog
          metrics={activeMetrics}
          measurements={health?.measurements ?? []}
          initialMetricId={selectedMetric.id}
          onClose={() => setIsAdding(false)}
        />
      ) : null}
      {isManaging && health ? (
        <MetricManager
          metrics={health.metrics}
          onClose={() => setIsManaging(false)}
        />
      ) : null}
    </section>
  );
}
