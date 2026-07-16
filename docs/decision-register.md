# Decision register

This file is a concise record of decisions made during product discovery. The
topic documents contain the detailed rationale and behavior.

## Product

- Mindfull is for one person.
- The daily priority is completing a check-in and reviewing tasks.
- Core features are habits, free-form journaling, mindfulness check-ins, tasks,
  and reminders.
- Check-ins aim to relax, support gratitude and focus, notice happy or
  meaningful aspects of life, and acknowledge hard parts.
- A typical check-in lasts about two minutes and every question is skippable.
- Morning and evening use different flows.
- Streaks are allowed; coercive gamification is not.
- AI voice is impersonal.

## Check-ins and prompts

- One morning and one evening check-in may exist per local date. Each remains
  editable only while it is a draft and becomes immutable on completion.
- Morning/evening boundaries are configurable.
- Prompt selection rotates.
- AI may introduce new questions based on history.
- AI questions are generated ahead of time, visibly labeled, and linked to
  their exact source.
- At most one AI question appears per check-in.
- Answering or skipping permanently dismisses that prompt instance.

## Habits and tasks

- Habits are done/not done, with weekdays and one reminder time.
- An explanation for a missed habit is optional and only requested when the
  user opens that habit.
- There is one task list in stable creation order; manual reordering is not
  exposed.
- Tasks may be manual or approved AI extractions.
- AI task suggestions always require approval.
- Tasks have no due dates or priorities.
- Tasks may have an availability date and exact reminder time.
- Tomorrow tasks are hidden from Today but visible in an optional Tomorrow
  section.
- Completed tasks remain for seven days before automatic deletion.
- Tasks can also be manually deleted.

## Journal and reflection

- Journal content is Markdown without attachments.
- Editing is plain text; rendering happens in reading mode.
- Journals remain editable drafts until Finish writing is chosen; completed
  journals and check-ins are immutable logs that may still be deleted.
- Summary screens are read-only editorial surfaces. Further reflection creates
  a new journal rather than editing the source or summary.
- Active check-ins use a focused modal; completed check-ins use a dedicated
  reading page with normal document scrolling.
- Titles are optional; there are no tags initially.
- Analysis status may be shown subtly.
- Weekly reviews are read-only generated snapshots.
- Missed scheduled reviews run after backend restart.
- Semantic search initially returns passages and source links, not chat answers.

## Health

- Health tracks body measurements for awareness and long-term trends only.
- Initial metrics are Weight, Waist, Belly, Hips, Chest, Upper arm, and Thigh.
- Custom metrics are limited to mass or circumference.
- Values are stored canonically in kilograms or centimetres and rendered in
  each metric's preferred unit.
- Recording is manual, one metric at a time, with exact automatic timestamps.
- Multiple entries per metric and day are allowed.
- Metrics can be renamed, archived, and restored; measurements can be edited
  and deleted.
- Health has a dedicated page, a restrained Today card, and a utility icon
  beside Settings, but no permanent bottom-navigation item.
- Charts show one metric at a time over 1 month, 3 months, 6 months, 1 year, or
  all history.
- Health does not include goals, reminders, medical interpretation, BMI,
  correlations, AI commentary, or device integrations.
- Individual measurements stay out of the general History timeline.

## Local first and sync

- Android and macOS desktop browsers are primary platforms.
- Core functionality works with the backend stopped.
- The PWA is the first target.
- Capacitor Android follows; Tauri macOS is deferred.
- Cross-device synchronization uses the Raspberry Pi backend.
- Conflicts resolve using the latest document timestamp with a deterministic
  device-ID tie-breaker.
- Deletion uses tombstones.
- Encryption beyond transport and existing environment protections is not
  required.
- A long-lived device pairing token is acceptable.

## Data model

- User-domain entities are typed documents distinguished by type.
- Documents carry schema versions and validated payloads.
- Body metrics and measurements use the existing typed-document envelope and
  generic synchronization path.
- Backend operational data remains in dedicated relational tables.
- Independently updated concerns use separate documents to reduce whole-document
  conflicts.

## Frontend and design

- TypeScript React SPA built with Vite.
- React Aria Components plus app-owned CSS Modules.
- Jotai for transient workflow/UI state.
- Dexie/IndexedDB for durable local state.
- Recharts is isolated to the lazy-loaded Health route.
- Soft serif for reflections and sans-serif for controls.
- Dedicated light/dark themes, system following, and time-aware presentation.
- Theme preference syncs; system resolution is device-local.
- Motion is gentle and respects reduced-motion preferences.
- Primary navigation is Today, History, and Reflect. Settings is a utility icon,
  and journal creation begins from Today.
- The interface avoids a familiar dashboard appearance.
- Repository guidance favors a functional core, immutable domain data, explicit
  side-effect boundaries, descriptive names, minimal dependencies, and a small
  risk-focused test portfolio.

## Backend, AI, and operations

- The backend runs on a Raspberry Pi 5 with 4 GB RAM.
- Deployment uses pnpm, Docker, and Docker Compose.
- UI and API are normally served from the Pi as one origin.
- Primary AI inference runs on the Pi and is provider-pluggable through the
  Vercel AI SDK boundary.
- Ollama is the first local provider.
- AI jobs are asynchronous and do not block product flows.
- Scheduler jobs run inside the backend container, never host crontab.
- Default weekly review schedule is Sunday at 7:00 PM.
- Daily SQLite backups retain seven daily and four weekly snapshots.
- Import/export UI is deferred.

## Deferred ideas

- Browser-local inference
- Chat-based exploration of personal history
- Additional personal-data document types
- macOS Tauri wrapper
- Data import/export UI
- Attachments or voice journaling
