import type { HealthRange } from '@mindfull/domain';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { Button } from 'react-aria-components';
import { Link } from 'react-router';

import { ensureDefaultBodyMetrics, loadHealthDocuments } from '../data/health';
import styles from './HealthPage.module.css';
import { HealthChart } from './health/HealthChart';
import { HealthOverview } from './health/HealthOverview';
import { MeasurementDialog } from './health/MeasurementDialog';
import { MeasurementHistory } from './health/MeasurementHistory';

const healthRanges: Array<{ value: HealthRange; label: string }> = [
  { value: '1m', label: '1 month' },
  { value: '3m', label: '3 months' },
  { value: '6m', label: '6 months' },
  { value: '1y', label: '1 year' },
  { value: 'all', label: 'All' },
];

export function HealthPage() {
  const health = useLiveQuery(loadHealthDocuments, []);
  const [selectedId, setSelectedId] = useState('body-metric:weight');
  const [range, setRange] = useState<HealthRange>('3m');
  const [isAdding, setIsAdding] = useState(false);

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
          <Link className={styles.textButton} to="/health/metrics">
            Manage metrics
          </Link>
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
    </section>
  );
}
