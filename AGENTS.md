# Working on Mindfull

Mindfull is a small, calm product. Its code should feel the same way: clear,
warm, unsurprising, and easy to change.

Prefer the smallest design that expresses the domain honestly. Minimal does not
mean compressed; clever one-liners and hidden control flow are not simplicity.

## Before changing code

- Read the relevant files in `docs/`. They are the product and architecture
  source of truth.
- Inspect nearby code and existing changes before editing.
- When code and documentation disagree, resolve the disagreement rather than
  silently choosing one.
- Make the smallest coherent change that completes the behavior.

## Visual changes

Before committing any change that affects layout, styling, copy placement, or
interactive presentation:

- Run the updated interface and capture screenshots of the relevant states.
- Use a mobile browser viewport for mobile behavior; include a desktop viewport
  when the change can affect wider layouts.
- Exercise the interaction rather than reviewing only its resting state. For
  example, open the dialog, expanded control, keyboard state, or error state
  that changed.
- View the final screenshots directly before committing. Do not rely only on
  tests, DOM inspection, or screenshots captured before the last edit.
- Correct visible spacing, clipping, overlap, hierarchy, and contrast problems
  before the commit.

## Code shape

Use a functional core with a small imperative shell.

- Keep domain rules pure: explicit inputs, explicit outputs, no hidden services.
- Treat data as immutable. Return new values instead of mutating arguments or
  shared state.
- Inject time, IDs, randomness, and external capabilities.
- Contain necessary mutation inside repositories, database transactions,
  notification adapters, sync transports, AI providers, and schedulers.
- Move decisions out of those boundaries and into pure domain functions.
- Prefer functions and plain objects. Use classes only when identity or
  lifecycle makes them clearer.
- Prefer discriminated unions to combinations of booleans.

Keep the happy path easy to scan. Early returns are welcome. Use functional
collection methods when they clarify the operation, but choose a small loop
when it reads better than a chain.

## Simplicity

- Build for current behavior, not imagined reuse.
- Do not generalize until two real callers reveal the same concept.
- A little duplication is cheaper than the wrong abstraction.
- Do not add a dependency for a small, well-understood function.
- Delete dead paths instead of preserving them "for later."
- Comments explain why; readable code explains what.
- Keep unrelated cleanup separate from the requested change.

## Names and types

Use the language of the product:

```ts
selectPromptForCheckIn
completedOnScheduledDay
pendingTaskSuggestions
nextReminderAt
```

Avoid vague names such as `processData`, `handleThing`, `manager`, `utils`,
`item`, and `temp`.

- Name booleans as questions: `isCompleted`, `canRunOffline`, `shouldCatchUp`.
- Include units when useful: `durationMs`, `retentionDays`.
- Name intermediate values when they explain a transformation.
- Parse untrusted data with Zod at the boundary; use validated types inside.
- Avoid scattered casts and non-null assertions. Clarify the invariant instead.
- Every synced document type has a discriminant, schema version, payload schema,
  and migration path.
- Keep provider, database, and platform types outside the domain.

## State and effects

- Dexie is the source of truth for durable local data.
- Jotai coordinates transient workflow and presentation state; it is not a
  second copy of the database.
- Prefer derived atoms to synchronized duplicate state.
- Components render and coordinate. Domain modules decide.
- Keep effects small and tied to an external system. Do not use an effect for a
  value that can be derived while rendering.
- Persist check-in progress after meaningful steps; do not trust component
  lifetime.

## Product constraints in code

- Write locally before attempting the network.
- Never make a core interaction wait for sync or AI.
- Assume the backend, AI provider, and notification permission are unavailable.
- Make retries and scheduled jobs idempotent.
- AI proposes; domain rules and the user decide.
- AI never creates tasks without approval.
- Never log journal text, check-in answers, prompts, or tokens.
- Use semantic HTML and React Aria behavior before recreating interactions.
- Preserve keyboard access, focus visibility, contrast, and reduced-motion
  support.
- Self-host daily-use assets; do not depend on third-party CDNs.

## Tests

Tests protect confidence, not a coverage number.

Test:

- Domain rules with meaningful branches, dates, or timezones
- Document validation and migrations
- Sync conflicts, cursors, retries, and tombstones
- Scheduler catch-up and idempotency
- Offline-to-online recovery
- A few complete flows the user depends on
- Regressions for bugs likely to return

Usually do not test:

- Library behavior or private implementation details
- Trivial getters, constants, and one-line mappings
- Every visual variant
- Broad snapshots updated without careful review
- The same rule at every test layer without a distinct risk

Prefer fast pure tests, focused boundary integration tests, and a small
Playwright suite. Use readable domain values. Avoid oversized fixtures,
excessive mocking, and assertions about internal call order.

## Dependencies

Use the selected stack before adding an alternative: React, Vite, React Router,
React Aria, CSS Modules, Jotai, Dexie, Zod, Fastify, Drizzle, SQLite, and the
Vercel AI SDK.

Before adding a dependency, ask:

1. Is the need present now?
2. Is the platform or current stack already sufficient?
3. Does it work with browser, ARM64, and offline constraints?
4. Does it remove more complexity than it adds?

Record meaningful architectural additions in the relevant document.

## Done

A change is done when the behavior works local-first, unavailable-service paths
are intentional, names and control flow explain the solution, the smallest
meaningful tests pass, accessibility remains intact, and documentation agrees
with the code.

In the handoff, state what changed, what was verified, and what remains
uncertain.
