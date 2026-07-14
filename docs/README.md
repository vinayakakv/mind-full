# Mindfull documentation

Mindfull is a private, calm, local-first mindfulness tracker for one person. It
combines short morning and evening check-ins, binary habits, Markdown
journaling, a simple task list, reminders, reflective insights, and optional
local AI.

These documents are the current source of truth for product and technical
decisions. They should be updated when an implementation decision changes.

Repository-wide implementation guidance lives in [`../AGENTS.md`](../AGENTS.md).
It translates the product's calm, minimal character into coding and testing
defaults.

## Documents

- [Product brief](./product-brief.md) — purpose, principles, scope, and success
  criteria.
- [Experience and flows](./experience-and-flows.md) — navigation and primary
  user journeys.
- [Domain model](./domain-model.md) — typed documents, lifecycle rules, and
  operational records.
- [Architecture and sync](./architecture-and-sync.md) — frontend, backend,
  local-first storage, conflict resolution, and native shells.
- [AI system](./ai-system.md) — provider boundary, asynchronous analysis,
  prompt candidates, semantic search, and weekly reviews.
- [Visual and interaction system](./visual-and-interaction-system.md) — tone,
  typography, themes, layout, and motion.
- [Deployment and operations](./deployment-and-operations.md) — Raspberry Pi,
  Docker Compose, scheduling, notifications, pairing, and backups.
- [Implementation plan](./implementation-plan.md) — vertical milestones, exit
  criteria, and commit strategy.
- [Decision register](./decision-register.md) — concise list of settled
  decisions and deferred ideas.

## Working rule

The application must remain useful when the Raspberry Pi, network, sync API,
and AI provider are unavailable. The backend enhances and synchronizes the
experience; it does not unlock the basic product.
