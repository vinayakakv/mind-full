# Mindfull

A quiet, local-first mindfulness tracker for check-ins, habits, journaling, and
small commitments.

Product and architecture decisions live in [docs](./docs/README.md). Repository
guidance lives in [AGENTS.md](./AGENTS.md).

## Development

Mindfull targets Node 24.18 or newer because the server uses Node's built-in
SQLite driver.

```sh
corepack enable
pnpm install
pnpm dev
```

The web app runs at `http://localhost:5173` and proxies `/api` to the server at
`http://localhost:3001`.

Useful checks:

```sh
pnpm check
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

The end-to-end suite expects the Compose app at `http://localhost:3001` and
uses real Chromium contexts for offline reload and cross-browser sync.

## Docker Compose

Copy `.env.example` to `.env`, choose a private pairing code, then run:

```sh
docker compose up --build
```

Open `http://localhost:3001`, visit Settings, and pair the browser using the
configured code. Application data is stored in the `mindfull-data` volume.
