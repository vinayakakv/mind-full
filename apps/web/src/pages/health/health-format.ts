import { type BodyUnit, displayedBodyValue } from '@mindfull/domain';

export const formatTimestamp = (timestamp: string): string =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(timestamp));

export const formatShortDate = (timestamp: number): string =>
  new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
  }).format(new Date(timestamp));

export const formatChange = (change: number, unit: BodyUnit): string => {
  const displayed = displayedBodyValue(change, unit);
  const sign = displayed > 0 ? '+' : '';

  return `${sign}${new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 2,
  }).format(displayed)} ${unit}`;
};
