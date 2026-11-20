# Contributing to Coinio

Thanks for taking the time. Bug reports, fixes, translations and small features are all welcome. For anything bigger than a fix, open an issue first so we can agree on the shape before you write the code.

## Setup

You need Node.js 22 and pnpm 12 (the version CI and the Docker image use is pinned in `.github/workflows/ci.yml` and `Dockerfile`).

```sh
pnpm install
pnpm dev
```

`pnpm dev` starts the API on port 4661 (tsx watch, data in `./.data`) and Vite on port 4660, which proxies `/api`, `/mcp`, `/oauth` and the other server paths to it. Open http://localhost:4660 and create an account; the dev database is yours to throw away (`rm -rf .data`).

## Before you open a pull request

```sh
pnpm typecheck
pnpm test        # Vitest, two projects: server (node) and web (jsdom)
pnpm build       # server bundle (tsup) and web app (Vite)
```

CI runs the same three, plus a Docker build, `shellcheck` on the shell scripts and a check of the install commands in the docs. Add or update tests with your change: server tests live in `tests/`, web tests next to the component (`*.test.tsx`).

### The demo

`site/demo/` is the browser-only demo served at https://getcoinio.me/demo/. It is a build output, but it is committed so the landing site can be deployed as static files. If your change touches the web app, rebuild it and commit the result in the same pull request:

```sh
pnpm build:demo
```

The demo runs the real web app against `src/web/demo/backend.ts`, an in-browser stand-in for the server that reuses the server's pure logic (`src/shared/`, `src/server/domain/`). Keep those modules free of Node-only imports, and when you change a rule in a server service (pausing, skipping, auto-pay), make the same change in the demo backend; there are comments marking the shared rules.

### The docs site

```sh
cd docs-site
pnpm install
pnpm dev                          # http://localhost:4665
pnpm build                        # static export to out/
pnpm lint:links                   # internal links and anchors
node scripts/check-commands.mjs   # install commands vs. image name, port and volume
```

Pages are MDX in `docs-site/content/docs`; the sidebar order comes from the `meta.json` files. Screenshots in `docs-site/public/screenshots` come in `-light` and `-dark` pairs and must show sample data only.

## Code style

- TypeScript everywhere, `strict` and `noUncheckedIndexedAccess` on. No `any` unless there is no other way.
- Match the style of the file you are in: two-space indent, single quotes, semicolons, short functions with a one-line doc comment when the name does not say it all.
- Comments explain why, not what.
- Money is stored and passed around as integers in the currency's minor unit (cents, whole yen); the exponent comes from `minorDigits` in `src/shared/money.ts`. Format only at the edge (`formatMoney`).
- Dates are `YYYY-MM-DD` strings handled in UTC, so the viewer's time zone never shifts a day. "Today" comes from the time zone in the settings (`todayIn`), not from the server clock.
- REST routes map rows explicitly (see `src/server/routes/subscriptions.ts`); never send raw Drizzle rows to the client.

## Translations

The interface ships in English and Turkish: `src/web/i18n/en.json` and `src/web/i18n/tr.json`. Every key must exist in both files; `src/web/i18n/i18n.test.ts` fails otherwise. Add new keys to both in the same change. Turkish uses the informal "sen", like the rest of the app.

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org) in English: `feat: add yearly report export`, `fix: keep the payment source on edit`, `docs: ...`, `chore: ...`, `test: ...`, `refactor: ...`. The subject is imperative and specific; the body says why.

## Things that are easy to trip over

- **Database changes:** edit `src/server/db/schema.ts`, then generate a migration with `pnpm exec drizzle-kit generate`. Migrations in `src/server/db/migrations` run on start; `pnpm build:server` copies them into `dist/`. Never edit a migration that has shipped.
- **Native dependencies:** pnpm only runs install scripts for packages listed under `allowBuilds` in `pnpm-workspace.yaml` (today `better-sqlite3` and `esbuild`). A new native dependency needs an entry there, or clean installs and the Docker build will break.
- **Outgoing requests to user-supplied hosts** (logo lookup) must go through `fetchPublic` in `src/server/services/logoCandidates.ts`. It resolves the host, refuses private and loopback addresses and re-checks every redirect.
- **Custom HTML cards** render in an iframe with `sandbox="allow-scripts"` and never `allow-same-origin`; a test enforces it. Do not loosen it.
- **Masked secrets:** the settings API returns the Telegram token masked, and saving the masked value back must not overwrite the real one (`src/server/services/settings.ts`).
- **OAuth** only turns on when `COINIO_PUBLIC_URL` is `https://` (or localhost). Test MCP clients locally with an API key instead.
- **Server paths vs. the SPA:** the server owns `/api`, `/mcp`, `/oauth`, `/logos`, `/.well-known` and the OAuth endpoints; anything else falls back to the web app. A new server path must be added to `SERVER_PATHS` in `src/server/app.ts` and to the proxy list in `vite.config.ts`.
- **Docker image size:** the Dockerfile deletes `simple-icons`' loose SVG files after `pnpm prune`; the app reads the package's `index.js`, so do not import individual icon files.

## Reporting security issues

Please do not open a public issue; see [SECURITY.md](SECURITY.md).
