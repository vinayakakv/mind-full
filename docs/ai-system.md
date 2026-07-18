# AI system

## Role

AI supports reflection and organization. It does not author the user's history,
silently create commitments, block the daily flow, or provide medical advice.

Initial AI capabilities:

- Journal and check-in summaries
- Task extraction with mandatory approval
- Recurring-theme detection
- Unfinished-commitment detection
- Habit correlations
- Personalized one-time prompt candidates
- Weekly reviews and grounded encouragement
- Local embeddings for semantic passage search

## Three layers

AI support has three deliberately small layers:

1. **Configuration** — one backend-owned OpenAI-compatible URL, API key,
   selected model, and response timeout.
2. **Infrastructure** — durable chronological jobs, one worker, leases,
   provider availability, and retry.
3. **Data** — synchronized reflection memory and task-specific derived
   documents.

Provider configuration and jobs are operational SQLite rows. They do not
synchronize. Reflection memory and generated results are documents because
they are part of the user's readable data.

## Provider boundary

The backend uses the Vercel AI SDK OpenAI-compatible provider. Mindfull does
not install, start, or otherwise own inference. The user supplies an API base
URL and API key in Settings, then selects a model returned by `/models`.
The response timeout is selected there as a bounded 2, 5, 10, or 20 minutes;
five minutes is the default. A job lease lasts one minute longer than the
selected timeout so a healthy slow invocation is not reclaimed.

The reference local provider is llama.cpp's `llama-server`. Other compatible
local or remote services may be used without changing domain services.

Provider-specific objects must not leak into domain documents. Analysis results
may record provider and model names for reproducibility, but domain commands
consume validated structured results.

The provider may run on the Pi or another Tailscale-reachable machine. Model
selection should favor small quantized models and predictable memory use.
Embedding configuration is deferred until semantic search.

Ordinary HTTP endpoints are accepted. Settings visibly names the destination
host because completed journal and check-in content is sent there. The API key
is stored in backend SQLite, never returned after saving, never synchronized,
and never logged.

Saving configuration does not require reachability. Settings shows Not
configured, Checking, Online, Offline, Invalid configuration, or Paused.
Invalid configuration adds a warning to the Settings utility icon; ordinary
downtime does not make the core application unhealthy.

## Stateful push contract

Mindfull prepares every input. The model receives no application tools and
cannot pull additional history.

```text
(current memory, current-week reflection, current tasks and habits,
 pending suggestions, task-specific input)
    -> (proposed updated memory, proposed updated week,
        task suggestions, habit suggestions)
```

Only incomplete tasks, active habits, and unresolved suggestions are included.
Completed tasks, habit logs, reminders, ordering metadata, and internal IDs are
not sent. This gives the model enough current state to avoid redundant
suggestions while keeping the prepared context small. Mindfull also performs a
normalized-text duplicate check before persisting a suggestion.

The entire structured response is validated and committed atomically. If the
memory or output is invalid, neither is stored. The commit also compares the
memory revision used for inference with the current revision; stale results
are retried against current memory.

Structured output uses one canonical Zod schema for both provider-facing
generation and Mindfull acceptance. Array counts, string bounds, and required
fields therefore cannot drift between two validation layers. When both
attempts fail, the backend logs the job kind, retry attempt, finish reason,
token counts, and privacy-safe validation issue paths and codes. Generated JSON
and journal content are never logged.

## Asynchronous work

AI work is always queued in the backend. A check-in or journal save completes
before analysis begins. Eligible completed reflections are queued when they
reach the backend through sync, and startup reconciliation recovers missed
work.

The AI work queue is a backend operational table with:

- Job type
- Source document ID
- Source content hash
- State
- Attempt count
- Next-attempt time
- Lease owner and expiry
- Last error
- Created and completed times

Jobs are idempotent by job type, source document, content hash, and analysis
version. Jobs run one at a time and in source chronology.

Provider availability has one backoff independent of the queue. While the
provider is unavailable, no job attempts are consumed and chronology does not
change. Transient failures back off to a quiet maximum of six hours and recover
automatically. Authentication, missing-model, and structured-output capability
errors pause processing until configuration changes. Invalid structured output
receives one corrective retry, then remains failed for manual retry.

## Finite reflection space

Reflect contains a small set of bounded artifacts rather than an accumulating
list of per-entry summaries: one long-term memory, one current-week reflection,
and unresolved task and habit suggestions. Journals and check-ins remain
canonical.

The current week is a synchronized singleton covering Monday through Sunday.
It is reset when the first reflection from a new week is processed. Weekly
snapshots will archive it when weekly-review scheduling is implemented; until
then rollover replaces it instead of creating an unbounded history.

Memory is limited to roughly 1,500–2,000 words and uses stable sections for
context worth remembering, supportive patterns, recurring themes, ongoing
commitments, open questions, and uncertain impressions. It is initially
read-only. Reflect shows when it last changed and links only to the documents
that caused that latest change.

The current week is limited to roughly 600–800 words and contains a summary,
bright spots, difficult parts, supportive actions, and questions to carry. Both
artifacts use separately validated fields so layout does not depend on
model-authored Markdown. A Markdown representation of memory is retained for
export and compatibility with existing data.

When memory is empty, Reflect offers an explicit one-time action to build it
from the previous year of completed journals and check-ins. The backend folds
bounded chronological batches through private staging memory and publishes
only the completed result. Historical entries do not receive individual
summaries or task suggestions. Rebuilding after deleting an influencing source
is future scope.

The staging row also exposes initialization progress: completed source count,
current eligible source count, and whether a batch is waiting, running, or
failed. Reflect polls this through the ordinary AI configuration endpoint, so
the phone may close without interrupting the backend-owned build.

## Structured output

AI output must be validated before becoming a domain document. Expected
structures should use Zod schemas and conservative limits for text lengths,
array sizes, and allowed categories.

Invalid output is retried within a small limit and then marked failed. Settings
shows a specific, safe explanation for connection, authentication, endpoint,
TLS, response-shape, and structured-output failures. Raw provider bodies,
prompts, journal content, and credentials are never returned or logged.

## Prompt candidates

Personalized questions are prepared ahead of time during journal/check-in
analysis or scheduled reflection work.

A candidate includes:

- One concise question
- Morning/evening suitability
- One or more exact source documents
- A short internal rationale
- Availability and optional expiry times
- Lifecycle state

At check-in time, the client selects at most one suitable candidate locally. It
can therefore work when the Pi is unreachable. If no candidate is suitable, a
curated rotating prompt is used.

AI may introduce genuinely new questions, including follow-ups such as whether
a previously stated intention happened. The visible UI labels the question as
AI-derived and links to its source date and entry. The AI voice remains
impersonal.

Answered and skipped candidates are permanently resolved and never presented
again.

## Task and habit suggestions

Task extraction produces `task-suggestion` documents, never tasks directly.

The user can:

- Accept, creating a task with source provenance
- Reject, permanently resolving the suggestion

Evening check-in suggestions may set `availableFrom` to the next local day.
Journal suggestions may be immediately available unless their wording indicates
a future start.

Habit extraction produces `habit-suggestion` documents. Choosing Set up opens
the normal habit form with the proposed name prefilled; the user still chooses
weekdays and an optional reminder. Dismissing either suggestion kind resolves
it permanently.

The model classifies commitments once: a concrete one-off action becomes a task
suggestion, a repeated practice becomes a habit suggestion, and a broader
intention remains in long-term memory. Reflect does not maintain a second
passive list of open commitments.

## Semantic search

The backend divides journal and check-in text into modest passages and stores
an embedding for each passage, source document ID, source content hash, and text
range.

Initial search behavior:

1. Embed the query locally.
2. Rank stored passages by similarity.
3. Return matching passages with dates and source links.
4. Do not generate a synthesized chat answer.

Embeddings are derived and rebuildable. They are not synchronized to clients.
If the Pi is offline, semantic search is unavailable while all source writing
remains readable locally.

## Weekly review

The default schedule is Sunday at 7:00 PM in the configured timezone. The
backend container owns this schedule and catches up after downtime.

The review covers:

- The week in a few lines
- What brought ease, happiness, or meaning
- What felt difficult
- Habit relationships
- Recurring themes
- Unfinished commitments
- A question for the coming week
- Encouragement grounded in actual records

Generated content is stored as a snapshot. The user may add a separate personal
reflection. A failed scheduled generation can be retried or run on demand.

## Privacy and degradation

- No cloud provider is required.
- Journal content remains within the browser devices, Pi, and configured local
  AI service.
- AI unavailability never prevents local writes or check-ins.
- The interface should distinguish Waiting for Mindfull, Reflected, and
  Unavailable without creating alarm.
- Curated prompts and deterministic task/habit behavior provide useful
  fallbacks when AI is absent.
