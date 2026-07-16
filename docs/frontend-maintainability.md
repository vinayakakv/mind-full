# Frontend maintainability plan

## Intent

The frontend should remain as calm to change as it is to use. This plan
strengthens boundaries that have become visible as the product grew, without
introducing a UI framework, service container, generic repository system, or
premature rendering abstractions.

The work is behavior-preserving unless a section explicitly describes a
correctness fix. Each slice should remain independently reviewable and keep the
offline-first write path intact.

## Settled organization

### Durable data

The low-level document store owns validation, transactions, dirty tracking,
remote application, and document-change events. Feature data modules own typed
queries and commands for one product area:

```text
data/
  document-store.ts
  settings.ts
  habits.ts
  tasks.ts
  journals.ts
  health.ts
  check-ins.ts
  reminders.ts
```

UI components consume typed feature functions rather than the raw Dexie table.
The store remains functions and plain values; no repository classes or
dependency-injection layer are introduced.

### UI foundations

Repeated, settled interaction patterns live under `components/ui`. The first
shared foundation is the short action dialog used for task creation and body
measurements. Shared control and field styles may follow when they remove real
duplication without hiding product-specific copy or layout.

The UI foundation remains inside the web application. A separate workspace
package is deferred until another application has a genuine independent use
for it.

### Feature components

Large files are split at product boundaries rather than by arbitrary line
count. Today-facing habits, habit management, habit forms, and habit details
are separate concerns. Health overview, measurement entry, charts, and history
are likewise allowed to become separate components.

Components coordinate rendering and user actions. Query and document mutation
rules remain outside them.

## Correctness and efficiency

- Time-derived UI refreshes at the next meaningful boundary and when the app
  regains visibility. An app left open across a period change or midnight must
  show the current check-in, habits, and available tasks.
- Live queries observe only the document types they need. Unrelated document
  writes should not recompute health cards or task suggestions.
- History pagination limits IndexedDB work as well as rendered rows. Merely
  slicing an already-loaded complete history is not considered lazy loading.
- Secondary routes remain lazy when they are not necessary for Today's first
  interaction.
- Async actions that can duplicate records expose a saving state and prevent a
  second submission. Missing or deleted routed documents render an intentional
  state instead of a blank page.

## Test boundary

Tests are added where the refactor introduces a meaningful risk:

- Store and feature modules retain existing document behavior tests.
- Time-boundary refresh behavior receives focused fake-time tests.
- History pagination tests ordering, filters, and continuation boundaries.
- One complete dialog flow protects task creation; React Aria's internal focus
  implementation is not retested in every dialog.

Broad visual snapshots, exhaustive primitive tests, and tests of module file
placement are intentionally avoided.

## Implementation sequence

- [x] Extract the document store and typed feature data modules while
  preserving public behavior.
- [x] Extract the shared short-action dialog and adopt it for task and
  measurement entry.
- [x] Add a small boundary-aware current-time hook and use it where date or
  period changes affect the UI.
- [x] Replace whole-database observers with typed queries and make History
  truly incremental.
- [x] Split oversized feature components along their existing product seams.
- [x] Tighten saving, loading, and missing states; lazy-load remaining
  secondary routes.

Each step is verified with Biome, TypeScript, the focused tests that cover the
changed boundary, a production build, and mobile and desktop inspection for
visual changes.
