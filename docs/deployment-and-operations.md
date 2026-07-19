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

SQLite data and backups use explicit mounted volumes. The web UI and API are
served from the same Mindfull origin.

Mindfull expects a configured OpenAI-compatible API but does not deploy or own
it. llama.cpp's `llama-server` is the reference local provider and may run on
the Pi or another reachable machine. Mindfull must start and work when the
provider is unavailable.

## Container publishing

GitHub Actions builds the container for `linux/amd64` and `linux/arm64`. Pull
requests build without publishing. Pushes to `main`, version tags, and manual
runs publish to `ghcr.io/vinayakakv/mind-full` with these tags:

- `sha-<commit>` for an immutable deployment reference
- the Git version tag for tags beginning with `v`
- `latest` for the default branch

Production should pin `sha-<commit>` so an update is deliberate and rollback is
unambiguous. The image contains application code only; pairing credentials and
SQLite data are supplied at runtime and remain in the Pi's persistent volume.

GHCR initially creates a package as private even when its source repository is
public. After the first successful publish, open the package settings on GitHub
and change its visibility to public. Public images can then be pulled by the Pi
without storing a GitHub credential.

The production Compose file and environment template live in `deployment/`.
On the Pi, copy the template, choose a published immutable image tag and a
private pairing code, then start the service:

```sh
cd deployment
cp .env.example .env
# Edit .env before continuing.
docker compose pull
docker compose up -d
curl http://127.0.0.1:3001/api/health
```

The default port binding is loopback-only. Make it available inside the tailnet
with HTTPS while leaving the container unavailable directly from the LAN:

```sh
sudo tailscale serve --bg http://127.0.0.1:3001
tailscale serve status
```

## Internal scheduler

All application schedules run inside the `mindfull` backend container.

Daily backups use a persisted run row and a small in-container polling loop.
AI work uses the broader leased job queue. Neither mechanism relies on host
timers.

Scheduled work includes:

- Daily SQLite backups
- Completed-task retention cleanup
- AI retry processing
- Optional derived-data maintenance

If the container is down at the daily backup time, the latest elapsed backup
slot runs after startup. Its slot is claimed idempotently, and a stale or failed
run can be retried. Future AI jobs use leases to prevent duplicate work after a
crash.

## Backups

- The backend creates one consistent SQLite snapshot daily using SQLite's
  online-backup API; it does not copy an active database file blindly.
- The default schedule is 3:00 AM in `MINDFULL_TIMEZONE`.
- The latest seven daily snapshots and four older weekly snapshots are kept.
- Success, path, size, and failure details are recorded in `backup_runs`.
- Each completed snapshot is checked with `PRAGMA quick_check` before it
  replaces the dated destination file.
- Temporary WAL and shared-memory sidecars are removed after verification;
  orphaned sidecars from an interrupted older run are cleaned before each
  scheduler check.
- Backups do not require Ollama, a browser, or an external scheduler.

The container always writes snapshots to `/backups`. `MINDFULL_BACKUP_PATH`
controls where Compose mounts that directory. Its default is the managed
`mindfull-backups` Docker volume. For files that are directly visible on the
Pi, set an absolute host path in `deployment/.env`:

```dotenv
MINDFULL_BACKUP_PATH=/srv/mindfull/backups
MINDFULL_TIMEZONE=Asia/Kolkata
BACKUP_LOCAL_TIME=03:00
BACKUP_DAILY_RETENTION=7
BACKUP_WEEKLY_RETENTION=4
```

The target directory must be writable by the container's `node` user. After a
deployment, confirm that a dated `mindfull-YYYY-MM-DD.sqlite` file appears
after the configured time or the first restart following it.

### Restore

Stop Mindfull before replacing its live database. Choose a dated snapshot,
preserve the current database beside the backups, copy the snapshot into
`/data`, and remove stale WAL sidecars before starting again:

```sh
docker compose down
docker compose run --rm --no-deps --entrypoint sh mindfull -c \
  'cp /data/mindfull.sqlite /backups/mindfull-before-restore.sqlite && \
   cp /backups/mindfull-YYYY-MM-DD.sqlite /data/mindfull.sqlite && \
   rm -f /data/mindfull.sqlite-wal /data/mindfull.sqlite-shm'
docker compose up -d
curl http://127.0.0.1:3001/api/health
```

Replace `YYYY-MM-DD` with the snapshot being restored. The server runs normal
database migrations at startup, so an older compatible snapshot is brought up
to the current schema automatically.

An import/export UI is not part of the first release. Restore instructions
remain deliberately operational rather than becoming a product workflow.

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
- Schedules one-time task alerts and weekday habit/check-in alerts locally,
  without the backend running.
- Maintains a local map from reminder document IDs to native notification IDs.
- Reconciles after reminder changes, startup, application resume, and app
  updates; Capacitor restores pending alarms after device reboot.
- Offers Done for habits and Complete or Remind me in one hour for tasks.
- Opens or resumes Mindfull before applying an action locally; no backend is
  required for the resulting task or habit write.
- Defers explicit rescheduling triggered only by a configured-timezone change
  to future scope.

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

Open Settings and choose **Allow alerts** before relying on reminders. Android
13 and newer asks for notification permission. Android 12 and newer may also
require **Allow exact times**, which opens the operating-system setting for
Mindfull. If either permission is unavailable, reminders still appear inside
Today when the app next reconciles. Native schedules and permission state stay
on the device and do not synchronize.

Native CSS targets Chrome/WebView 101 so the minimum supported Android WebView
receives conventional media-query syntax. Capacitor 8.4.2 is pinned with a
small pnpm patch that guards its safe-area injection until the document root
exists; remove the patch when an upstream release includes the same guard.

### macOS

Mindfull remains usable in a macOS browser, but dedicated PWA installation and
offline validation work is future scope. A Tauri shell for reliable closed-app
local alerts is deferred with it.

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
