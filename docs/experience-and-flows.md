# Experience and flows

## Information architecture

Mindfull has three primary destinations:

- **Today** — the relevant check-in, today's habits, available tasks, and at
  most one recent insight.
- **History** — a chronological record of journals, completed check-ins, habit
  completions, and explicitly recorded misses.
- **Reflect** — weekly reviews, insights, themes, streaks, correlations, and
  semantic search.

Health is a dedicated secondary destination reached from a restrained card on
Today and a utility icon beside Settings. It does not occupy a permanent
bottom-navigation position and individual measurements do not enter the general
History timeline.

Settings remains a separate destination for schedules, reminders, theme, sync,
devices, and AI configuration, but appears as a quiet gear icon rather than a
primary named tab. Mobile uses restrained bottom navigation for Today, History,
and Reflect. Desktop uses the same centered reading layout with a small top
navigation. It should not grow a permanent sidebar.

History records what happened; Reflect considers what it might mean. History
is a human-readable projection of activity documents rather than a raw view of
settings, reminders, or operational records.

## Today

The opening view contains:

- A time-aware greeting
- A clear invitation to begin or resume the relevant check-in
- Today's scheduled habits
- Available incomplete tasks
- Recently completed tasks, visually quiet and retained for seven days
- At most one useful recent insight
- A subtle sync state rather than a prominent connection dashboard
- A quiet floating action for beginning a journal entry
- A restrained Health card showing the latest body measurement and its change
  from the preceding reading of the same metric

Tomorrow-only tasks are hidden from today's main list. An optional Tomorrow
section lets the user review them early.

## History

- Entries are grouped by local day and shown newest first.
- The initial filters are All, Journals, Check-ins, and Habits.
- Completed journal entries open a typographic reading surface without edit
  controls.
- Completed check-ins open a dedicated read-only summary page. The focused
  modal is reserved for the active step-by-step flow and its short completion
  moment.
- Today's summary titles read This morning or This evening. Past entries use
  Morning check-in or Evening check-in beside their recorded date.
- Habit history includes recorded completions and explicitly recorded misses;
  a calculated absence is not presented as a logged event.
- Results are revealed in small pages with automatic continuation near the end
  and an explicit Load more control as an accessible fallback.
- History keeps its active filter and revealed page count in the URL. Returning
  from an entry restores its stable entry anchor rather than a fragile pixel
  position.
- Settings, reminders, drafts, and synchronization metadata do not appear.

## Check-in rules

- There is at most one morning and one evening check-in per local date.
- Drafts remain editable until completion. Completed check-ins are immutable
  historical records.
- The morning/evening time boundaries are customizable.
- The app offers the relevant flow automatically, while either flow remains
  manually accessible.
- Every step is skippable.
- Draft state is saved after each step and resumes after a reload or app exit.
- At most one AI-generated question may appear in a check-in.
- AI questions are clearly labeled and link to the exact source that inspired
  them.
- Answering or skipping an AI question permanently resolves that prompt
  instance.
- Curated questions use direct, concrete language. Warmth comes from tone and
  pacing rather than metaphors or abstract terms that require interpretation.
- Refining curated wording does not change its prompt ID. Completed check-ins
  preserve the exact prompt text that was shown when they were created.

## Morning check-in

The exact prompts rotate, but the flow follows this shape:

1. A short arrival or breathing pause
2. Named energy and mood choices. Energy uses Drained, Low, Steady, and
   Energized; mood uses Tender, Even, Hopeful, and Light.
3. A small selection of emotion words
4. Something good, meaningful, or appreciated
5. Acknowledgement of an expected difficulty
6. A focus or intention for the day
7. At most one relevant AI-derived question
8. Optional short free-form Markdown reflection
9. A quiet completion state

The flow should avoid asking every possible question on every day. Selection
must respect the two-minute target.

## Evening check-in

The exact prompts rotate, but the flow follows this shape:

1. A short decompression transition
2. Named mood and stress choices. Mood uses Heavy, Tender, Content, and At
   ease; stress uses Low, Noticeable, and High.
3. A small selection of emotion words
4. What felt good or went well
5. What was difficult
6. A self-compassion, release, or acceptance prompt
7. What matters tomorrow
8. At most one relevant AI-derived question
9. Optional short free-form Markdown reflection
10. Review and approve any extracted tomorrow tasks
11. Understated, evidence-based encouragement

Tomorrow-oriented statements may become task suggestions. They are never added
without approval.

## Habits

- Habits are binary: done or not done.
- A habit has selected weekdays and one configurable reminder time.
- Completing a habit records a habit-log document.
- A scheduled day without a completion is calculated as missed.
- The day may end as incomplete without requiring an explanation.
- Opening a missed habit offers an optional reason field. The evening check-in
  does not proactively interrogate missed habits.
- Streaks count consecutive scheduled occurrences, not calendar days.
- Android notifications offer a Done action.
- Today keeps a simple completion list in the chosen habit order. Ordering is
  changed only from Manage habits.
- `/habits` shows a rolling seven-day rhythm ending today. Each habit is a
  readable row of scheduled, completed, missed, and unscheduled days; scheduled
  days in this window may be corrected directly and offer a brief undo action.
- Dates older than the seven-day correction window are read-only.
- Selecting a habit opens `/habits/:habitId`, with its current streak, recent
  completion count, a restrained twelve-week completion chart, and exact
  recent occurrences.
- Manage habits opens the dedicated `/habits/manage` page. Its reorder actions
  remain open while a habit is moved so repeated keyboard or touch moves do
  not require reopening the control.
- Habit weekday changes take effect from a dated schedule version so old
  statistics keep the schedule that was active at the time.
- Creating, editing, or viewing a habit provides an explicit return to the full
  habit list. Returning to Today is a separate page action.

## Tasks

Mindfull has one task list rather than projects or categories.

A task contains:

- Text
- Completion time, if completed
- Optional time from which it becomes available
- Optional exact reminder time
- Source: manual, journal, or check-in

Tasks do not have due dates, priorities, overdue states, or urgency colors.
Incomplete tasks retain their creation order. Completed tasks move into a
visually subdued group below incomplete tasks. There is no manual reordering
interface.
Creating a task opens a short contextual dialog with the task text and an
optional exact reminder time. Saving or cancelling returns directly to the
unchanged task list.
Incomplete tasks remain until completed or manually deleted. Completed tasks
remain visible for seven days and are then automatically deleted from the
visible domain through a deletion tombstone.

Task reminders offer Complete and Remind me in one hour actions where the
platform allows them. Completing a task immediately clears its in-app reminder;
snoozing clears the current notice and schedules the next exact reminder.

## Journal

- Entries use a calm plain-text Markdown editor.
- Markdown is rendered when reading an entry; there is no simultaneous preview
  requirement.
- A title is optional. Without one, the date and first line form the display
  heading.
- Entries autosave locally.
- Entries remain editable drafts until Finish writing is chosen.
- Finished entries are immutable. They may be read or permanently deleted, but
  not reopened in the editor.
- Multiple entries per day are allowed.
- AI analysis is asynchronous and never interrupts writing.
- Analysis state may appear as a subtle status such as Waiting for Mindfull,
  Reflected, or Unavailable.

## Suggestions

Unresolved AI task and habit suggestions appear in Reflect. Task suggestions
may also remain visible from Today where they are immediately actionable.

Each suggestion shows:

- Proposed task text
- Its journal or check-in source
- Accept and reject controls

Task acceptance creates a normal task with source provenance. A habit
suggestion opens ordinary habit setup with the name prefilled; weekdays and
reminders are never assumed. Rejection resolves a suggestion permanently. AI
never bypasses this review.

## Reflect

Reflect is a finite collection of calm cards or sections:

- pending task suggestions;
- pending habit suggestions;
- the bounded current-week reflection;
- questions to carry; and
- a long-term memory preview with a clear Read memory action.

Suggestions lead because they may need a decision. Long-term memory closes the
page as the quieter, least time-sensitive layer.

Concrete one-off commitments appear as task suggestions, repeated practices as
habit suggestions, and broader intentions in long-term memory. There is no
separate passive open-commitments card.

The full memory is a dedicated editorial reading page with source provenance
and the reset action. When empty, Reflect offers an optional button to build it
from the previous year of completed journals and check-ins. Empty suggestion
sections are omitted.

AI configuration lives in Settings. URL and API key reveal a model dropdown
from `/models`; a compact status shows provider availability. A configuration
problem adds a warning to the Settings icon, while ordinary provider downtime
does not affect local writing.

Semantic search initially returns matching passages with dates, context, and
links to their source. It does not synthesize a conversational answer in the
first release.

Summary surfaces are editorial reading views. They show generated or recorded
content without text fields, disabled form controls, or inline editing. A new
journal entry is used when a summary inspires further reflection.

## Health

Health presents a compact latest-value overview and one selected metric's trend
chart. The user can switch among 1 month, 3 months, 6 months, 1 year, and All
without combining unlike metrics on one chart.

Adding a measurement is a small modal or mobile drawer: select a metric, enter
one value in its preferred unit, and save. The value is converted to kilograms
or centimetres before local persistence. Multiple same-day readings remain
independent and preserve exact timestamps.

The textual measurement list supports editing and deletion. Selecting or
focusing a chart point reveals its exact value and timestamp, but chart points
do not carry editing actions. Metric management supports custom mass and
circumference metrics plus rename, archive, restore, and preferred-unit changes
on the dedicated `/health/metrics` page.

Health uses factual absolute changes without targets, percentages, medical
interpretation, reminders, correlations, or AI commentary.

## Timezones and themes

Existing check-ins preserve the local date and timezone in which they were
created. New schedules, habits, and check-ins use the currently configured
timezone.

Theme preference synchronizes, but a "follow system" choice resolves
independently on each device. Morning and evening presentation may shift warmth
and color while remaining within the selected light or dark theme.
