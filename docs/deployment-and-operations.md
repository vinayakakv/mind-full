# Deployment and operations

## Target environment

Mindfull is self-hosted on a Raspberry Pi 5 with 4 GB RAM behind Tailscale. The
Pi already hosts other services, so Mindfull must have bounded resource usage
and straightforward recovery.

Production is deployed with Docker Compose. The stack is self-contained and
does not rely on host cron, host systemd timers, external databases, cloud job
runners, or required third-party APIs.

## Services

The intended Compose stack contains:

- `mindfull` — built SPA, API, sync engine, scheduler, backups, and AI
  orchestration
- `ollama` — local inference service with a persistent model volume

SQLite data, backups, and Ollama models use explicit mounted volumes. The web UI
and API are served from the same Mindfull origin.

Ollama is part of the self-hosted stack but remains an optional capability from
the application's perspective. Mindfull must start and work if Ollama is
unavailable.

## Internal scheduler

All application schedules run inside the `mindfull` backend container.

The scheduler uses persisted SQLite job rows rather than relying solely on
in-memory timers. A small polling loop claims due jobs with a lease, runs them,
and records completion or retry state.

Scheduled work includes:

- Weekly review generation
- Daily SQLite backups
- Completed-task retention cleanup
- AI retry processing
- Optional derived-data maintenance

If the container is down at a scheduled time, overdue jobs run after startup.
Jobs are idempotent and leases prevent duplicate execution after a crash.

The default weekly review time is Sunday at 7:00 PM in the configured timezone.

## Backups

- Create one consistent SQLite snapshot daily.
- Retain seven daily snapshots.
- Retain four weekly snapshots.
- Store snapshots in a Docker-mounted backup directory.
- Record success, path, size, and error metadata in an operational table.
- Use SQLite-safe backup/checkpoint behavior rather than copying an actively
  changing database blindly.

An import/export UI is not part of the first release. Restore instructions
should nevertheless be documented before production use.

## Pairing and authentication

Tailscale restricts network reachability, but devices also authenticate with a
long-lived pairing token.

- The server stores only a secure hash of each token.
- Each token is associated with a device ID and human-readable device name.
- Tokens can be revoked from Settings.
- Native clients remember the Mindfull server URL and token in platform-secure
  storage where available.
- The browser installation served by the Pi uses the same API origin and a
  device credential established during setup.

Pairing should be intentionally simple for one person. It does not need email,
OAuth, account recovery, organizations, or roles.

## Notifications

The shared Reminder documents express notification intent. Each device has a
local scheduling adapter.

### Browser PWA

- Works offline while open and from its cached application shell.
- Uses available browser notification features as progressive enhancement.
- Reconciles reminders at startup, on focus, after visibility changes, and
  whenever local or synchronized documents change.
- Keeps a due reminder visible inside Today when notification permission is
  absent, denied, or unsupported.
- Catches up an elapsed one-time task reminder when the app next opens.
- Collapses several missed recurring occurrences into one in-app catch-up,
  then schedules the next future occurrence.
- Does not promise exact closed-app offline alerts.

The browser stores only local occurrence and delivery state. Permission and
system-notification status never synchronize. Reminder documents for habits,
tasks, and morning/evening check-ins synchronize normally and are usable while
the backend is unavailable.

### Android shell

- Uses Capacitor local notifications.
- Schedules exact local alerts where Android permissions and platform policy
  allow it.
- Maintains a local map from reminder document IDs to native notification IDs.
- Reschedules after reminder changes, timezone changes, app updates, and device
  reboot where required.
- Supports Mark complete for habits and Complete/Remind me in one hour for
  tasks where notification actions are available.

The native project lives at `apps/web/android` and uses application ID
`app.mindfull`. Capacitor 8 development requires Node 22 or newer, Android
Studio 2025.2.1 or newer, JDK 21, and Android SDK 36. The web build remains the
source of truth; `cap sync android` copies it into the native project. On this
Mac, use Homebrew's JDK without changing the system Java installation:

```sh
export JAVA_HOME="$(brew --prefix openjdk@21)/libexec/openjdk.jdk/Contents/Home"
pnpm android:sync
pnpm android:apk
pnpm android:open
```

The debug APK is written to
`apps/web/android/app/build/outputs/apk/debug/app-debug.apk`. Native builds omit
the PWA service worker because the application shell is already packaged in the
APK. Android cloud backup is disabled so journals and check-ins are not copied
to an unrelated backup provider.

After installing, open Settings and enter the backend origin before pairing,
for example `https://mindfull.example` on Tailscale. The Android emulator reaches
the host machine at `http://10.0.2.2:3001`. Private plain-HTTP addresses are
allowed for LAN and emulator development; prefer HTTPS when the server is
reachable beyond a trusted private network. Browser installations served by
Mindfull leave the field empty to keep same-origin sync.

Native CSS targets Chrome/WebView 101 so the minimum supported Android WebView
receives conventional media-query syntax. Capacitor 8.4.2 is pinned with a
small pnpm patch that guards its safe-area injection until the document root
exists; remove the patch when an upstream release includes the same guard.

### macOS

The first release uses the browser PWA. A Tauri shell for reliable closed-app
local alerts is deferred.

## Resource behavior

- AI jobs run at low concurrency on the 4 GB Pi.
- The main server remains responsive while inference is active.
- Model and embedding choices must be configurable rather than hard-coded.
- Startup does not block on loading or downloading a model.
- Health checks distinguish core application health from optional AI health.
- Logs must not print journal bodies, check-in answers, tokens, or AI prompts.

## Service degradation

| Unavailable component | Expected behavior |
|---|---|
| Network/Pi | All local product features continue; sync waits. |
| Ollama | AI jobs wait or fail visibly but quietly; core server works. |
| Semantic index | Source entries remain available; semantic search reports unavailable. |
| Notification permission | In-app reminders remain visible; Settings explains permission state. |
| Backend scheduler downtime | Persisted overdue jobs catch up after restart. |
