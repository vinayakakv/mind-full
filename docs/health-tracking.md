# Health tracking

## Purpose

Health is a quiet record of body measurements for awareness and long-term
trends. It is not a medical dashboard and does not interpret values, prescribe
targets, or connect measurements to habits, mood, journals, or AI analysis.

Measurements are entered manually whenever useful. A future one-time import may
write older records directly through the same document boundary, including
their original timestamps; an import UI is not part of this slice.

## Initial metrics

Mindfull creates these body metrics on first use:

- Weight
- Waist
- Belly
- Hips
- Chest
- Upper arm
- Thigh

Custom metrics are allowed, but remain deliberately constrained to mass or
circumference. A metric has one preferred display unit. The initial preferences
are kilograms for Weight and centimetres for circumference metrics.

Metrics can be renamed, archived, and restored. Defaults behave like custom
metrics after creation. A referenced metric is not permanently deleted because
its identity is needed to render existing measurements.

## Canonical values and conversion

Values are always stored in metric units:

- Mass in kilograms
- Circumference in centimetres

The preferred unit affects input and presentation only. Pounds and inches are
converted at the repository/domain boundary before storage, and canonical
values are converted back for display. Changing a preferred unit therefore
does not rewrite history or mix units inside a chart.

Input accepts up to two decimal places. Display removes unnecessary trailing
zeroes. Editing an entry uses the metric's current preferred unit, then converts
the saved value back to its canonical unit.

## Health page

Health is a dedicated secondary destination rather than a permanent bottom
navigation item. It is reachable from a small utility icon beside Settings and
from a restrained Today card. The card shows the most recently recorded body
measurement, its absolute change from the previous entry of the same metric
when one exists, and a link to the Health page.

The Health page opens with:

- A compact overview of every active metric's latest value and change
- A selected metric and its responsive line chart
- Range choices for 1 month, 3 months, 6 months, 1 year, and All
- An Add measurement action
- A link to the dedicated `/health/metrics` management page, including archived
  metrics

One metric is charted at a time. The chart connects actual values with a gentle
line and uses no goals, target bands, judgmental colors, or good/bad language.
Selecting or focusing a point reveals only its exact timestamp and value. Edit
and delete actions belong to the measurement list rather than the chart.
Recharts is lazy-loaded with the Health route; the rest of the daily interface
does not carry the visualization dependency.

## Recording flow

Add measurement opens a compact centered dialog on every viewport. It contains:

1. A metric selector
2. One numeric value field, prefilled with that metric's latest recorded value
3. The selected metric's preferred unit
4. Save and Cancel actions

Only one metric is recorded at a time. Saving is local-first and never waits
for the backend. Multiple readings of the same metric may exist on one day;
their exact timestamps and individual values are preserved.

Changing the selected metric loads that metric's own latest value. A metric
without any history starts with an empty field. Editing always opens with the
selected entry's value rather than a newer reading.

Entries may be edited or deleted from Health. There are no notes or custom
date/time controls in the normal recording flow. Deletion uses the ordinary
synchronized tombstone behavior.

## Explicit exclusions

This slice does not include:

- Goals, ideal ranges, target lines, or progress judgments
- BMI or other calculated health indicators
- Reminders or measurement schedules
- Medical warnings or interpretation
- Percentage changes
- Correlations with habits, check-ins, or journals
- AI summaries, encouragement, or commentary
- Health Connect or device imports
- Individual measurements in the general History timeline
- A user-facing bulk import tool

## Accessibility and tone

Charts must not be the only representation of the data. Latest values and
measurement history remain readable as text, chart points are keyboard
focusable, and exact values are available without relying on color or pointer
hover. The page keeps Mindfull's narrow, composed layout and avoids turning the
metric overview into a dense dashboard.
