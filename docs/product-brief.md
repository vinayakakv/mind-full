# Product brief

## Purpose

Mindfull is a quiet daily space for checking in, noticing what is good,
acknowledging what is hard, writing freely, and keeping a small set of habits
and commitments in view.

It is built for one person rather than a public audience. It does not need
social features, multi-user collaboration, subscriptions, engagement loops, or
growth mechanics.

## Daily outcome

Within the first minute of opening Mindfull, the user should be able to:

1. Begin or resume the appropriate morning or evening check-in.
2. See today's habits.
3. Review the currently available tasks.

A normal check-in should take about two minutes. Every question is skippable.

## Product principles

### Calm over density

Mindfull should feel like a composed private space, not a productivity
dashboard. It should use quiet typography, generous spacing, restrained color,
and a narrow reading-focused layout.

### Reflection without denial

Prompts should support relaxation, gratitude, focus, and attention to happy or
meaningful aspects of life. They should also make room for difficulty without
forcing positivity or trying to solve every hard experience.

### Local first

Writing, check-ins, habits, tasks, settings, and reminders are written locally
first. The interface never waits for the backend before accepting an action.

### AI is optional and impersonal

AI may summarize, find recurring themes, identify unfinished commitments,
extract task suggestions, prepare personalized questions, and support semantic
search. It should remain understated and impersonal. It must not present itself
as a friend, therapist, or authority.

### No coercive gamification

Streaks and consistency can be shown, but they should not use guilt, loss
aversion, competitive framing, confetti, or punitive language. Prefer factual
phrasing such as "4 of the past 7 scheduled days."

### Maintainability over novelty

The code and interface should share the same character: warm, legible,
intentional, and free from unnecessary layers.

## Version-one scope

- Morning and evening mindfulness check-ins
- Binary habits with selected weekdays and exact-time reminders
- Free-form Markdown journal entries
- A single manually ordered task list
- Optional exact-time task reminders
- AI task suggestions that always require approval
- Personalized, one-time AI prompt candidates generated ahead of time
- Habit correlations, recurring themes, check-in and journal summaries,
  unfinished commitments, and weekly reviews
- Streaks and gentle encouragement
- Semantic search returning matching passages
- Offline-first PWA
- Synchronization through a self-hosted Raspberry Pi backend
- Android native shell after the web/backend milestone
- Theme toggle with dedicated light and dark themes plus system following

## Explicitly out of scope for the first release

- Accounts for multiple people
- Social or sharing features
- Attachments, images, or voice notes
- Rich-text editing
- Tags for journal entries
- Projects, lists, priorities, or due dates for tasks
- Cloud-hosted AI as a required service
- Conversational exploration of journal history
- Data import/export UI
- macOS native shell in the first milestone

Conversational exploration, body measurements, additional document types, and
a macOS shell are possible later additions.

## Success criteria

- A check-in, journal entry, habit completion, and task update all work with the
  backend stopped.
- The installed app reopens into usable local data without a network.
- Sync resumes without manual recovery when the Pi returns.
- AI failures never block writing or check-ins.
- A complete normal check-in can be finished in about two minutes.
- The interface does not resemble a generic admin dashboard.

