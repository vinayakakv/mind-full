import {
  type BodyMeasurementDocument,
  type BodyMetricDocument,
  displayedBodyValue,
  type HealthRange,
  measurementsInHealthRange,
} from '@mindfull/domain';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import styles from '../HealthPage.module.css';
import { formatShortDate, formatTimestamp } from './health-format';

export function HealthChart({
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
