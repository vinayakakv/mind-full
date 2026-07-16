# Architecture and sync

## Repository shape

The anticipated repository uses a small pnpm workspace:

```text
mindfull/
├── apps/
│   ├── web/       React PWA and its Capacitor Android project
│   └── server/    API, sync, jobs, backups, and AI orchestration
├── packages/
│   ├── domain/    document types, schemas, migrations, and pure rules
│   └── ui/        app-owned accessible UI primitives and tokens
├── docs/
└── compose.yaml
```

The `ui` package should remain small. If a separate package adds ceremony
without reuse, it may begin inside `apps/web` and be extracted when Android is
added.

## Frontend

- TypeScript and React SPA built with Vite
- React Router in simple declarative mode
- React Aria Components for accessible behavior
- App-owned CSS Modules and global design tokens
- Jotai for transient interface and workflow state
- Dexie over IndexedDB for durable local documents
- Zod for document and API validation
- `react-markdown` for rendered journal and review content
- A Vite PWA/Workbox service worker for application-shell caching

### State boundaries

Jotai owns transient state such as:

- Active check-in ID and current step
- In-progress selections before persistence completes
- Transition direction
- Open sheets and dialogs
- Connectivity and current sync activity
- Device-local presentation state

Dexie owns durable state such as:

- Check-in drafts and answers
- Journals
- Tasks and suggestions
- Habits and logs
- Settings and prompt candidates

The full database is not copied into atoms. Components observe persisted
documents through Dexie live queries. Workflow write atoms call domain
repositories that persist changes locally.

The low-level document store owns validation, local transactions, dirty-state
tracking, and remote application. Typed feature data modules own queries and
commands for settings, habits, tasks, journals, health, check-ins, and
reminders. Components do not receive the raw Dexie document table.

## Backend

- Node.js 24.15 or newer, using the built-in SQLite driver
- Fastify HTTP server
- SQLite with Drizzle-managed schema and migrations
- Vercel AI SDK provider registry
- Ollama as the initial local provider
- Static PWA assets served by the same server and origin as the API

The backend is a synchronization peer and processing host, not the primary
runtime for everyday interactions.

## Local-first write path

```text
User action
  -> validate domain command
  -> write document to IndexedDB transaction
  -> mark document dirty in local sync metadata
  -> reactive UI updates
  -> schedule a non-blocking sync attempt
```

No normal user action waits for a network response.

## Local document storage

IndexedDB uses one domain-document store plus local operational stores. Useful
top-level envelope fields are indexed, including type, occurred time, parent,
deletion time, and manual sort key. Adding a future query-specific index may
require an IndexedDB schema version bump even when the backend document table
does not change.

Local-only stores include:

- Sync state and dirty-document outbox
- Server cursor
- Device identity
- Native reminder mappings
- Browser reminder occurrence and delivery state
- Cached application metadata

## Server document storage

SQLite uses a canonical `documents` table:

```sql
CREATE TABLE documents (
  id                   TEXT PRIMARY KEY,
  type                 TEXT NOT NULL,
  schema_version       INTEGER NOT NULL,
  payload              TEXT NOT NULL CHECK (json_valid(payload)),
  occurred_at          TEXT,
  parent_id             TEXT,
  sort_key              TEXT,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL,
  updated_by_device_id  TEXT NOT NULL,
  deleted_at            TEXT
);
```

Common indexes cover type/time, parent/type, updated time, and deleted time.
JSON expression indexes may be added only for demonstrated query needs.

## Synchronization protocol

The server owns a monotonically increasing change sequence. Each accepted
document mutation appends an entry referencing the changed document.

A sync cycle:

1. Client pushes dirty document envelopes in a batch.
2. Server authenticates the paired device and validates every document through
   the type/schema registry.
3. Server resolves each mutation using document-level last-write-wins.
4. Server commits accepted documents and change-sequence entries atomically.
5. Client requests server changes after its last cursor.
6. Client applies returned documents in one or more IndexedDB transactions.
7. Client advances its cursor only after the local commit succeeds.
8. Client clears dirty markers only for versions acknowledged by the server.

Sync is attempted at launch, after local changes, when connectivity returns,
when the app regains focus, periodically while open, and through a manual
control. Requests arriving during an active sync coalesce into another pass
before the client returns to idle, so a local write made during a network round
trip does not wait for the periodic interval.

Every local write is attributed to the current device. Before upload, the
client also repairs any older device identity found on a document already
marked dirty, advancing its timestamp monotonically before sending it. This
recovers safely from older migrations or a replaced local device identity.
Clean documents received from another device are never re-attributed, and the
repair is idempotent.

Reminder intent follows this same sync path. Device-local occurrence state is
not synchronized: each installation records its next scheduled instant and any
currently due in-app reminder in a separate IndexedDB store. Android also keeps
a stable local mapping from a reminder occurrence key to its native integer
notification ID. That mapping is an adapter detail, not a domain document.

## Conflict resolution

Conflicts resolve per document using:

1. Newer `updatedAt`
2. Lexical `updatedByDeviceId` as a deterministic tie-breaker

Device clocks are expected to be synchronized by their operating systems. The
chosen policy accepts that two concurrent edits to the same journal or check-in
may lose the older version. Independent concerns are placed in separate
documents to reduce avoidable conflicts.

Deletion tombstones participate in the same comparison.

## Progressive native capability

The browser PWA is the first target. Exact closed-app offline notifications are
not assumed to be reliable in a pure browser installation.

The Android project at `apps/web/android` reuses the web build and maps Reminder
documents to Capacitor local notifications. One-time reminders become exact
alarms; recurring reminders become one native weekday schedule per selected
day. Reconciliation uses stable notification IDs, replaces changed schedules,
cancels stale ones, and relies on Capacitor's boot receiver to restore pending
alarms. Keeping the shell beside its web assets follows Capacitor's normal build
and sync flow. The adapter sits behind a small capability interface so web and
Android behavior differ without forking domain logic.

Each installation keeps its backend address locally. An empty address means the
web application's own origin; packaged Android installations use an absolute
HTTP or HTTPS origin. Changing it clears that server's pairing token and sync
cursor, but never deletes local documents. Android routes fetch through
Capacitor's native HTTP bridge so a private Pi or Tailscale origin does not need
browser CORS configuration.

A Tauri macOS shell is deferred. The browser PWA remains the initial macOS
experience.

## Testing strategy

- Vitest for document migrations, prompt selection, scheduling rules, streaks,
  retention, and conflict resolution
- React Testing Library for focused component and check-in behavior
- Playwright for primary flows, offline reload, service-worker updates, sync
  recovery, and multi-client conflicts
- Server integration tests against temporary SQLite databases
- Migration tests using fixtures from every prior schema version
- Real-device Android notification tests after the Capacitor milestone
