# Implementation plan

Mindfull will be built as thin vertical slices. Each milestone must leave the
application usable and reviewable rather than creating disconnected layers that
only work after a large integration phase.

## Milestone 1 — Local-first walking skeleton

Status: complete as of July 14, 2026.

Prove the hardest architectural promise:

> Create a task or morning check-in offline, reload safely, reconnect,
> synchronize to the Raspberry Pi backend, and see it from another browser.

### Repository foundation

- Standalone Git repository
- pnpm workspace
- `apps/web`, `apps/server`, and `packages/domain`
- Shared TypeScript, formatting, linting, and Vitest configuration
- Small root command surface: `dev`, `build`, `test`, and `typecheck`

### Domain foundation

- Typed document envelope
- Client-generated ULIDs
- Zod schema registry
- Settings, task, and check-in documents
- Pure last-write-wins comparison
- Versioned document migration boundary

### Local web application

- React and Vite application shell
- React Aria primitives with app-owned CSS Modules and design tokens
- Dedicated light and dark themes with system following
- Dexie document repository
- Jotai state for the active check-in workflow
- Today screen
- Task creation, manual ordering, completion, and deletion
- Small morning check-in with skippable steps and persisted progress
- Offline reload through the PWA application shell

### Backend

- Fastify server
- SQLite document and change-log tables
- Long-lived pairing-token authentication
- Batched push/pull sync endpoints
- Same-origin static SPA serving
- Core and optional-service health reporting

### Deployment

- Multi-stage ARM64-compatible container
- Docker Compose definition
- Mounted SQLite data directory
- Same-origin UI and API
- No required AI service in this milestone

### Proof tests

- Document validation and migration tests
- Last-write-wins and tombstone tests
- Server sync integration test
- Offline write/reload Playwright flow
- Two-browser synchronization Playwright flow

### Exit criteria

- Tasks and a morning check-in work without the server.
- Reloading while offline preserves data and an active check-in draft.
- Starting the server causes pending documents to synchronize automatically.
- A second paired browser receives the synchronized documents.
- Service-worker assets permit the installed app to open without the server.
- The relevant typecheck, unit, integration, and end-to-end tests pass.

The acceptance suite proves offline task, check-in, habit, and journal work
survives a service-worker-backed reload. It also verifies habit, journal, and
task synchronization between paired browser contexts. The same multi-stage
image used for Raspberry Pi deployment runs the domain, local-storage, and
server integration suites while building.

## Milestone 2 — Complete daily experience

Status: in progress as of July 15, 2026.

- [x] Full morning and evening flows
- [x] Rotating curated prompts and emotion vocabulary
- [x] Time-aware flow selection and configurable daily boundaries
- [x] Habits, schedules, optional miss reasons, and streaks
- [x] Shared reminder documents and progressive browser notifications
- [x] Journal writing and rendered reading mode
- Shared task-suggestions area
- Time-aware theme variations and polished gentle motion
- Seven-day completed-task retention job

Morning and evening check-ins are separate editable documents. Both use a
resumable, fully skippable flow with named states, emotion words, stable prompt
snapshots, and an optional final reflection. Curated wording rotates
deterministically by local date, so creating or resuming a check-in never
depends on connectivity or randomness. The Today screen offers the relevant
flow from synchronized time boundaries while keeping the other flow available.

Journal entries now use the same typed document and synchronization path as the
rest of the local-first domain. Writing autosaves to IndexedDB, survives an
offline reload through its URL-addressed draft, and renders safely as Markdown
when reading. Multiple entries per day appear in a chronological history and
remain editable or deletable through synchronized tombstones.

Habits now have weekday schedules, an optional future reminder time, archive
and restore behavior, and deterministic per-day log documents. Today shows only
the habits scheduled for the current local day and completion works entirely
offline. Habit details calculate streaks across scheduled occurrences and let a
past miss carry an optional, editable reason without requiring one.

Reminder intent now lives in typed, synchronized documents with stable IDs per
habit, task, or check-in target. Habit reminders recur on their selected days,
tasks accept a one-time exact reminder, and morning/evening reminders can be
configured in Settings. Each browser independently calculates occurrences in
the configured timezone, uses service-worker notifications when permission is
available, and retains a due reminder inside Today otherwise. Browser delivery
is deliberately progressive: the app catches up while opening or returning to
the foreground, but exact closed-app alerts remain an Android-native milestone.

## Milestone 3 — Local AI and reflection

- Optional Ollama Compose service
- Persisted AI work queue with leases and idempotency
- Task extraction with mandatory approval
- Journal/check-in summaries and recurring themes
- Ahead-of-time one-time prompt candidates
- Local embeddings and semantic passage search
- In-container scheduler and catch-up behavior
- Weekly review snapshots
- Daily SQLite backups

## Milestone 4 — Android capability

- Capacitor Android wrapper
- Native exact-time local-notification adapter
- Habit and task notification actions
- Rescheduling after reboot, timezone changes, and app updates
- Real-device notification and offline tests

## Commit strategy

Commits should describe complete reviewable ideas rather than file categories.
The expected Milestone 1 sequence is:

1. Document the implementation plan and establish repository tooling.
2. Add the typed document core with focused tests.
3. Add the locally persisted Today/task experience.
4. Add the persisted morning check-in flow.
5. Add authenticated generic document sync.
6. Add PWA/deployment behavior and end-to-end proof.

The sequence may be combined where separating commits would leave a misleading
or non-working state. Every commit must pass the checks relevant to its scope.
