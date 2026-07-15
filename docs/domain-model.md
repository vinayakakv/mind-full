# Domain model

## Model strategy

User-domain data is stored as typed documents distinguished by `type`. The same
document envelope is used in IndexedDB and SQLite so adding a domain such as
body measurements does not require changing the synchronization protocol.

The store is flexible, not schemaless. Every document type requires a TypeScript
type, Zod schema, schema version, migration path, and repository functions.

## Document envelope

```ts
type DocumentEnvelope<
  TType extends string = string,
  TPayload = unknown,
> = {
  id: string;
  type: TType;
  schemaVersion: number;
  payload: TPayload;

  occurredAt: string | null;
  parentId: string | null;
  sortKey: string | null;

  createdAt: string;
  updatedAt: string;
  updatedByDeviceId: string;
  deletedAt: string | null;
};
```

Identifiers should be client-generatable and chronologically sortable, such as
ULIDs. Timestamps are ISO-8601 UTC instants. Documents containing a local-date
concept also record the original local date and IANA timezone in their payload.

## Domain document types

### Settings

A synchronized singleton containing:

- Morning and evening time boundaries
- Morning, evening, habit, and review reminder preferences
- Configured timezone
- Theme preference: light, dark, or system
- Weekly-review schedule
- Completed-task retention, initially seven days

Device-specific resolved theme and native-notification identifiers do not
synchronize.

### Habit

```ts
type HabitPayload = {
  name: string;
  weekdays: number[];
  reminderTime: string | null;
  archivedAt: string | null;
};
```

### Habit log

```ts
type HabitLogPayload = {
  habitId: string;
  localDate: string;
  timezone: string;
  outcome: "completed" | "missed";
  reason: string | null;
};
```

A log is written for a completion or an explicitly recorded miss. An absent log
on a scheduled past day is calculated as a miss. This avoids pre-generating
occurrence records.

### Task

```ts
type TaskPayload = {
  text: string;
  completedAt: string | null;
  availableFrom: string | null;
  reminderAt: string | null;
  source:
    | { kind: "manual" }
    | { kind: "journal"; documentId: string }
    | { kind: "check-in"; documentId: string };
};
```

Tasks retain creation order. The envelope's `sortKey` remains populated for
stable ordering and synchronization compatibility, but there is no manual
reordering interaction.

### Journal

```ts
type JournalPayload = {
  title: string | null;
  markdown: string;
  localDate: string;
  timezone: string;
};
```

AI status is not embedded in the journal because the backend and client may
update those concerns independently.

### Check-in

```ts
type CheckInPayload = {
  kind: "morning" | "evening";
  localDate: string;
  timezone: string;
  status: "draft" | "completed";
  currentStep: number;
  mood: string | null;
  energy: string | null;
  stress: string | null;
  emotions: string[];
  responses: Array<{
    promptId: string;
    promptText: string;
    source: "curated" | "ai";
    answer: string | null;
    skipped: boolean;
  }>;
  reflectionMarkdown: string | null;
  completedAt: string | null;
};
```

Prompt text is snapshotted into the response so later prompt-library changes do
not alter history.

### Prompt candidate

```ts
type PromptCandidatePayload = {
  question: string;
  suitableFor: "morning" | "evening" | "either";
  sourceDocumentIds: string[];
  rationale: string;
  availableFrom: string;
  expiresAt: string | null;
  state: "available" | "presented" | "answered" | "dismissed";
};
```

Candidates are generated ahead of time, synchronize to devices, and are usable
without the backend. Answering or skipping resolves the candidate permanently.

### Task suggestion

```ts
type TaskSuggestionPayload = {
  proposedText: string;
  availableFrom: string | null;
  sourceDocumentId: string;
  sourceContentHash: string;
  state: "pending" | "accepted" | "rejected" | "superseded";
  acceptedTaskId: string | null;
};
```

### Analysis result

A derived document linked to a journal or check-in. It records the source
content hash, state, summaries, themes, unfinished commitments, timestamps, and
provider/model metadata. Keeping it separate prevents an AI status update from
overwriting an offline journal edit.

### Insight

A concise derived observation with a type, text, supporting date range, source
document IDs, creation time, and dismissal state.

### Weekly review

```ts
type WeeklyReviewPayload = {
  weekStart: string;
  weekEnd: string;
  generatedMarkdown: string;
  personalReflectionMarkdown: string | null;
  sourceDocumentIds: string[];
  generatedAt: string;
  provider: string;
  model: string;
};
```

Generated content is a snapshot and is not silently regenerated. Personal
reflection remains independently editable within the review document.

### Reminder

```ts
type ReminderPayload = {
  targetType: "habit" | "task" | "check-in";
  targetId: string;
  scheduledAt: string | null;
  localTime: string | null;
  weekdays: number[] | null;
  enabled: boolean;
};
```

The shared reminder describes intent. Each device maintains local-only mapping
to a platform notification identifier and scheduling status.

Reminder IDs are deterministic per target, such as
`reminder:habit:<habit-id>`, so devices editing the same reminder converge on
one document. Habit `reminderTime` remains temporarily as a compatibility
mirror for habits created before Reminder documents existed. On startup, the
web client creates a missing Reminder from that field; notification scheduling
uses the Reminder document.

### Body metric

```ts
type BodyMetricPayload = {
  name: string;
  kind: "mass" | "circumference";
  preferredUnit: "kg" | "lb" | "cm" | "in";
  archivedAt: string | null;
};
```

The schema requires a mass metric to use kg or lb and a circumference metric to
use cm or in. Built-in metrics use deterministic IDs such as
`body-metric:weight`, allowing offline devices to converge while creating the
defaults. Custom metrics use normal client-generated IDs.

Metric documents hold synchronized definition and presentation preferences,
not recorded values. A metric may be renamed, archived, or restored. It remains
available for resolving historical entries even while archived.

### Body measurement

```ts
type BodyMeasurementPayload = {
  metricId: string;
  value: number;
};
```

The envelope's `occurredAt` is the exact measurement time. `value` is canonical:
kilograms for mass and centimetres for circumference. Preferred-unit conversion
is a pure presentation/input concern and never rewrites existing measurement
documents. Multiple entries for a metric may share a local date.

Deleting a measurement creates a normal tombstone. Metric definitions are
archived rather than deleted while any measurement references them.

## Future documents

Additional document types follow the same envelope and schema registry. New
payload types may avoid SQL table changes, but they still require payload
versioning and application migrations.

## Backend-only operational tables

Infrastructure records are relational tables rather than domain documents:

- Devices and hashed pairing tokens
- Server change sequence and client sync cursors
- Scheduled jobs and execution leases
- AI work queue and attempt history
- Embeddings and their source content hashes
- Backup execution records

These records have different consistency and lifecycle requirements and should
not be forced through the user-document abstraction.

## Deletion

Deleting a domain object sets `deletedAt`. Tombstones synchronize like other
documents so an offline device cannot resurrect deleted content.

Completed tasks are automatically tombstoned seven days after completion.
Tombstones may remain indefinitely initially because the dataset is small and
this makes long-offline device recovery safe. Physical compaction can be added
only after the server tracks acknowledgement by every paired device.
