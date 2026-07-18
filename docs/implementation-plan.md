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
- Task creation, completion, and deletion
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

Status: complete as of July 15, 2026.

- [x] Full morning and evening flows
- [x] Rotating curated prompts and emotion vocabulary
- [x] Time-aware flow selection and configurable daily boundaries
- [x] Habits, schedules, optional miss reasons, and streaks
- [x] Shared reminder documents and progressive browser notifications
- [x] Journal writing and rendered reading mode
- [x] History timeline, journal compose action, and simplified navigation
- [x] Shared task-suggestions area
- [x] Time-aware ambient color fields and polished gentle motion
- [x] Seven-day completed-task retention job

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
remain editable while they are drafts. Finished entries are immutable logs:
they may be read or permanently deleted through synchronized tombstones, but
not reopened for editing.

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
the foreground. The Android shell now maps the same documents to exact native
alarms.

Navigation now separates Today, History, and Reflect. Journals begin from a
quiet compose action on Today and completed entries join a chronological
History alongside completed check-ins and recorded habit outcomes. Settings is
a utility icon rather than a primary tab. Tasks retain creation order and move
into a subdued completed group instead of exposing mobile reordering controls.

AI-proposed tasks now have their own synchronized document type and a shared
Suggestions area on Today and History. A proposal appears only after its
availability time, names its reflection source, and can only become a normal
task through explicit acceptance. Dismissal is permanent, while acceptance
keeps journal or check-in provenance on the created task. Accepted task IDs are
derived from suggestion IDs so simultaneous offline approvals converge instead
of creating duplicates.

Completed tasks remain visible for the configured seven days. Local
housekeeping runs at launch, after synchronized document changes, and whenever
the app returns to the foreground; expired tasks and their reminders become
ordinary dirty tombstones. Cleanup therefore works without the backend, catches
up after downtime, synchronizes across devices, and remains idempotent.

## Milestone 2.5 — Body measurements

Status: complete as of July 15, 2026.

- [x] Typed `body-metric` and `body-measurement` documents
- [x] Pure canonical-unit conversion and trend calculations
- [x] Deterministic creation of the seven default metrics
- [x] Offline measurement creation, editing, deletion, and synchronization
- [x] Metric rename, preferred-unit selection, archive, and restore
- [x] Dedicated Health page with latest-value overview and measurement history
- [x] Accessible single-metric chart with five time ranges and exact timestamps
- [x] Latest-measurement card on Today and utility Health icon beside Settings
- [x] Focused domain, repository, offline reload, and two-browser sync tests

The slice is complete when recording and reviewing measurements works with the
backend stopped, unit changes do not rewrite canonical history, deleted entries
synchronize as tombstones, and charts have an equivalent textual history.

Values are stored canonically as kilograms or centimetres while each body
metric synchronizes its preferred display unit. Stable default IDs and an old
initial version timestamp let independently initialized browsers converge
without overwriting later customization. Health remains outside primary bottom
navigation and History; its chart dependency is isolated to the lazy route.

## Milestone 3 — Android capability

Status: complete as of July 17, 2026.

### Android foundation

- [x] Capacitor 8 Android wrapper beside the web application
- [x] Repeatable build, sync, open, and debug-APK commands
- [x] Calm app identity, splash screen, system bars, safe areas, and back behavior
- [x] Configurable Pi address and pairing from the packaged application
- [x] Android 13/WebView 101 emulator install and offline cold-start
- [x] Offline startup and IndexedDB persistence on a real Android device
- [x] Web/PWA and Docker builds remain unchanged

The packaged app was paired from an Android 13 emulator to the local container
at `http://10.0.2.2:3001`. A task created with emulator networking disabled was
absent from a second client's pull, then appeared after networking returned and
the normal focus retry ran. This verifies the native HTTP transport and the
offline-to-online document path. Offline startup, persistence,
synchronization, and the packaged daily experience were subsequently accepted
on a real Android device.

### Native reminders

- [x] Native exact-time local-notification adapter
- [x] Habit and task notification actions
- [x] Rescheduling after reminder changes, reboot, and app updates
- [x] Real-device notification and backend-off tests

The native adapter schedules one-time task alarms and weekday-based habit and
check-in alarms without contacting the backend. It requests Android 13 display
permission in Mindfull Settings, exposes Android's exact-alarm setting, keeps a
stable local document-to-notification map, cancels stale alarms, and reconciles
after document changes and application resume. Capacitor's restore receiver
recreates pending alarms after reboot. In an Android 13 emulator, a recurring
check-in reminder fired at its exact minute while Mindfull was backgrounded and
the next day's alarm remained scheduled.

Habit alerts offer Done. Task alerts offer Complete and Remind me in one hour.
Capacitor opens or resumes Mindfull for an action, then the ordinary local-first
document commands apply it without waiting for the backend. Completing a task
disables its reminder and removes any matching in-app notice; snoozing updates
the task and reminder atomically before the native schedule is reconciled. A
consumed one-time alarm is retained as a visible notification until its reminder
is resolved instead of being cancelled by the next reconciliation pass.

Android keeps its own IndexedDB; data moves between an existing browser
installation and Android through normal document synchronization rather than
shared local storage.

Milestone 3 was accepted after native reminders, notification actions, offline
writes, restart persistence, and later synchronization worked on the real
device with the backend unavailable during local actions.

### Deferred platform follow-ups

Explicit native-alarm rescheduling solely in response to a configured-timezone
change is future scope. Existing reconciliation after reminder edits, startup,
resume, reboot, and app updates remains part of Milestone 3.

Dedicated macOS browser/PWA installation and offline validation is also future
scope. A Tauri shell remains deferred with it; neither is required to complete
Milestone 3.

## Milestone 4 — Local AI and reflection

- [x] Backend-owned OpenAI-compatible URL, key, and model configuration
- [x] Provider status, model discovery, invalid-configuration warning, and pause
- [x] Persisted chronological AI work queue with leases and idempotency
- [x] Provider-level exponential backoff and restart reconciliation
- [x] User-visible bounded reflection memory with reset
- [x] Optional one-year initial memory built in chronological batches
- [x] Atomic journal/check-in analysis, memory update, and task extraction
- [x] Journal/check-in summaries, themes, and unfinished commitments
- [ ] Ahead-of-time one-time prompt candidates
- [ ] Local embeddings and semantic passage search
- [ ] In-container weekly-review scheduling and catch-up behavior
- [ ] Weekly review snapshots
- [x] Daily SQLite backups (completed July 17, 2026)

The model is user-configured rather than part of Mindfull's Compose deployment.
llama.cpp's `llama-server` is the reference local provider; the Vercel AI SDK
preserves the generic OpenAI-compatible boundary.

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
