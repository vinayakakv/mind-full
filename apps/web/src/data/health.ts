import type {
  BodyMeasurementDocument,
  BodyMetricDocument,
} from '@mindfull/domain';

import {
  addBodyMeasurement,
  createBodyMetric,
  deleteBodyMeasurement,
  documentTable,
  ensureDefaultBodyMetrics,
  setBodyMetricArchived,
  updateBodyMeasurement,
  updateBodyMetric,
} from './document-store';

export {
  addBodyMeasurement,
  createBodyMetric,
  deleteBodyMeasurement,
  ensureDefaultBodyMetrics,
  setBodyMetricArchived,
  updateBodyMeasurement,
  updateBodyMetric,
};

const metricOrder = (left: BodyMetricDocument, right: BodyMetricDocument) =>
  (left.sortKey ?? '').localeCompare(right.sortKey ?? '') ||
  left.payload.name.localeCompare(right.payload.name);

export const loadBodyMetrics = async (): Promise<BodyMetricDocument[]> => {
  const documents = await documentTable()
    .where('type')
    .equals('body-metric')
    .toArray();

  return documents
    .filter(
      (document): document is BodyMetricDocument =>
        document.type === 'body-metric' && !document.deletedAt,
    )
    .sort(metricOrder);
};

export const loadHealthDocuments = async (): Promise<{
  metrics: BodyMetricDocument[];
  measurements: BodyMeasurementDocument[];
}> => {
  const [metrics, measurementDocuments] = await Promise.all([
    loadBodyMetrics(),
    documentTable().where('type').equals('body-measurement').toArray(),
  ]);

  const measurements = measurementDocuments.filter(
    (document): document is BodyMeasurementDocument =>
      document.type === 'body-measurement' && !document.deletedAt,
  );

  return { metrics, measurements };
};
