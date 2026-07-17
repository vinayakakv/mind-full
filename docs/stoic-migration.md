# One-time Stoic migration

Stoic migration is an operational command, not a product interface. It reads a
Stoic JSON backup ZIP and creates completed Mindfull journals and check-ins.
It does not restore or replace the Mindfull SQLite database.

## Safety model

The importer uses the normal paired synchronization API. Generated document
IDs are namespaced with `stoic:` and deterministic from Stoic record IDs. Before
applying, the importer reads the IDs already known by the server and submits
only absent documents.

This makes the import additive:

- Existing Mindfull entries are never submitted as updates.
- Re-running the same archive skips records already imported.
- An interrupted import can be safely run again.
- Imported records enter the normal server change log and synchronize to every
  paired installation.

Confirm that the backend's scheduled SQLite backup has completed recently
before applying. SQLite restore remains a whole-database recovery operation; it
is deliberately not part of this merge flow.

## Mapping

- Stoic free-form journals become completed Mindfull journals. A level-one
  attributed-text heading becomes the title and the remaining text becomes the
  Markdown body. The first newline is the fallback title boundary.
- Guided journals become completed journals whose template name is the title
  and whose questions and answers form the Markdown body.
- Dream Journal is recognized by its built-in Stoic template ID.
- Morning Preparation and Evening Reflection become completed morning and
  evening check-ins.
- Afternoon, midday, and any other routine types are intentionally skipped and
  included in the import report. They do not fit Mindfull's two-part daily
  check-in rhythm.
- A Daily Check-In joins the closest morning or evening routine on the same
  local date. Without a routine, its local time selects morning or evening.
- Recognized mood values become Mindfull mood labels. Other answers remain
  ordered check-in responses.
- Known sleep, rest, motivation, and day scales become readable words rather
  than raw zero-based ratings. Built-in yes/no feedback values also regain
  their Stoic labels.

Stoic's Android export can omit labels for built-in choices. The importer maps
the bundled focus-choice UUIDs to their English Stoic labels. An unfamiliar
choice set shows the number of selections with a labels-unavailable note and a
warning instead of displaying opaque IDs or guessing their meaning. Unknown
question IDs receive the neutral label `Imported reflection` and are also
reported.

Historical imports do not create reminders, notifications, tasks, or AI work.
Imported journals and check-ins are completed immutable logs.

## Dry run

Export **Stoic JSON Backup (.zip)** from Stoic, then run:

```sh
pnpm import:stoic ./stoic-data-export.zip \
  --timezone Asia/Kolkata
```

The command validates and converts the archive, prints counts and structural
warnings, and performs no network request or write. It never prints journal or
check-in content.

To inspect the complete transformed documents locally, add an unused output
path:

```sh
pnpm import:stoic ./stoic-data-export.zip \
  --timezone Asia/Kolkata \
  --output ./stoic-import-review.json
```

The review file contains private journal content. It is created with owner-only
permissions and the command refuses to overwrite an existing file.

## Apply

Provide the backend pairing code through the environment rather than a command
argument:

```sh
MINDFULL_PAIRING_CODE='your pairing code' \
pnpm import:stoic ./stoic-data-export.zip \
  --timezone Asia/Kolkata \
  --server https://your-mindfull-address \
  --apply
```

The command pairs a dedicated device named `Stoic migration`, enumerates the
server's document IDs, and uploads missing records in small batches. Its final
report shows imported, already-present, and warning counts. Open History after
the next device sync and inspect a few journals and check-in summaries before
discarding the original Stoic export.

The local machine needs Node 24, pnpm, and the `unzip` command.
