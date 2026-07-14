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

## Provider boundary

The backend uses the Vercel AI SDK behind a local provider registry. The first
provider is Ollama on the Raspberry Pi. OpenAI-compatible endpoints and other
AI SDK providers may be configured later without changing domain services.

Provider-specific objects must not leak into domain documents. Analysis results
may record provider and model names for reproducibility, but domain commands
consume validated structured results.

Primary inference runs on a Raspberry Pi 5 with 4 GB RAM. Model selection must
favor small quantized models and predictable memory use. A separate lightweight
embedding model is acceptable. Browser inference is deferred but the provider
boundary must not prevent it later.

## Asynchronous work

AI work is always queued. A check-in or journal save completes before analysis
begins.

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

Jobs are idempotent by job type, source document, and content hash. Editing a
source queues analysis for the new hash. Pending suggestions from an older hash
become superseded; accepted tasks remain untouched.

## Structured output

AI output must be validated before becoming a domain document. Expected
structures should use Zod schemas and conservative limits for text lengths,
array sizes, and allowed categories.

Invalid output is retried within a small limit and then marked failed. The UI
shows an understated Unavailable status rather than raw provider errors.

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

## Task extraction

Task extraction produces `task-suggestion` documents, never tasks directly.

The user can:

- Accept, creating a task with source provenance
- Reject, permanently resolving the suggestion

Evening check-in suggestions may set `availableFrom` to the next local day.
Journal suggestions may be immediately available unless their wording indicates
a future start.

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

