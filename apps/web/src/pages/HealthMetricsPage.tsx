import {
  type BodyMetricDocument,
  type BodyMetricKind,
  type BodyUnit,
  unitsForBodyMetric,
} from '@mindfull/domain';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { Button, Form, Input, Label, TextField } from 'react-aria-components';
import { Link } from 'react-router';

import {
  createBodyMetric,
  ensureDefaultBodyMetrics,
  loadBodyMetrics,
  setBodyMetricArchived,
  updateBodyMetric,
} from '../data/health';
import styles from './HealthMetricsPage.module.css';

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
          <TextField value={name} onChange={setName} isRequired autoFocus>
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

export function HealthMetricsPage() {
  const metrics = useLiveQuery(loadBodyMetrics, []) ?? [];
  const [name, setName] = useState('');
  const [kind, setKind] = useState<BodyMetricKind>('circumference');
  const [showArchived, setShowArchived] = useState(false);
  const preferredUnit = kind === 'mass' ? 'kg' : 'cm';
  const visibleMetrics = metrics.filter(
    ({ payload }) => showArchived || !payload.archivedAt,
  );

  useEffect(() => {
    void ensureDefaultBodyMetrics();
  }, []);

  const addMetric = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) return;
    await createBodyMetric(name.trim(), kind, preferredUnit);
    setName('');
  };

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div>
          <p>Your measures</p>
          <h1>Body metrics</h1>
        </div>
        <Link to="/health">Back to health</Link>
      </header>

      <ul className={styles.metricList}>
        {visibleMetrics.map((metric) => (
          <MetricRow key={metric.id} metric={metric} />
        ))}
      </ul>
      {metrics.some(({ payload }) => payload.archivedAt) ? (
        <Button
          className={styles.showArchivedButton}
          aria-pressed={showArchived}
          onPress={() => setShowArchived((shown) => !shown)}
        >
          {showArchived ? 'Hide archived' : 'Show archived'}
        </Button>
      ) : null}
      <Form className={styles.newMetricForm} onSubmit={addMetric}>
        <h2>Add a custom metric</h2>
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
    </section>
  );
}
