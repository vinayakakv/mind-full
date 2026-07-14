# Experience and flows

## Information architecture

Mindfull has four primary destinations:

- **Today** — the relevant check-in, today's habits, available tasks, and at
  most one recent insight.
- **Journal** — a plain Markdown writing surface and previous entries.
- **Reflect** — weekly reviews, insights, themes, streaks, correlations, and
  semantic search.
- **Settings** — schedules, reminders, theme preference, sync, devices, and AI
  configuration.

Mobile uses restrained bottom navigation. Desktop uses the same centered
reading layout with a small top navigation. It should not grow a permanent
sidebar.

## Today

The opening view contains:

- A time-aware greeting
- A clear invitation to begin or resume the relevant check-in
- Today's scheduled habits
- Available incomplete tasks
- Recently completed tasks, visually quiet and retained for seven days
- At most one useful recent insight
- A subtle sync state rather than a prominent connection dashboard

Tomorrow-only tasks are hidden from today's main list. An optional Tomorrow
section lets the user review them early.

## Check-in rules

- There is at most one morning and one evening check-in per local date.
- Both remain editable afterward.
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

## Morning check-in

The exact prompts rotate, but the flow follows this shape:

1. A short arrival or breathing pause
2. Named energy and mood choices
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
2. Named mood and stress choices
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
- Notifications may offer a Mark complete action.

## Tasks

Mindfull has one task list rather than projects or categories.

A task contains:

- Text
- Manual position
- Completion time, if completed
- Optional time from which it becomes available
- Optional exact reminder time
- Source: manual, journal, or check-in

Tasks do not have due dates, priorities, overdue states, or urgency colors.
Incomplete tasks remain until completed or manually deleted. Completed tasks
remain visible for seven days and are then automatically deleted from the
visible domain through a deletion tombstone.

Task reminders offer Complete and Remind me in one hour actions where the
platform allows them.

## Journal

- Entries use a calm plain-text Markdown editor.
- Markdown is rendered when reading an entry; there is no simultaneous preview
  requirement.
- A title is optional. Without one, the date and first line form the display
  heading.
- Entries autosave locally.
- Multiple entries per day are allowed.
- AI analysis is asynchronous and never interrupts writing.
- Analysis state may appear as a subtle status such as Waiting for Mindfull,
  Reflected, or Unavailable.

## Suggestions

Unresolved AI task suggestions appear in a shared Suggestions area reachable
from Today and Journal.

Each suggestion shows:

- Proposed task text
- Its journal or check-in source
- Accept and reject controls

Acceptance creates a normal task with source provenance. Rejection resolves the
suggestion permanently. AI never bypasses this review.

## Reflect

Reflect includes:

- Weekly-review snapshots
- A separate editable personal reflection for each review
- Habit consistency and correlations
- Recurring journal and check-in themes
- Unfinished commitments
- Gentle encouragement grounded in recorded data
- Semantic search

Semantic search initially returns matching passages with dates, context, and
links to their source. It does not synthesize a conversational answer in the
first release.

## Timezones and themes

Existing check-ins preserve the local date and timezone in which they were
created. New schedules, habits, and check-ins use the currently configured
timezone.

Theme preference synchronizes, but a "follow system" choice resolves
independently on each device. Morning and evening presentation may shift warmth
and color while remaining within the selected light or dark theme.

