# Crypto Watchlist

Self-hosted crypto watchlist. A small Node backend polls ~25 exchanges via
[CCXT](https://github.com/ccxt/ccxt) once a minute and serves a tiny Svelte frontend, so the
browser makes **one request per minute** — all exchange work happens server-side.

## Run

```bash
npm install
npm run serve      # builds the frontend, then starts the server
# open http://localhost:3000
```

On first run your personal list `data/watchlist.json` is seeded from
`data/watchlist.example.json` (BTC/ETH/SOL on three exchanges). It is gitignored — edit it from the
UI or by hand; it won't be committed.

## Features

- Dense grid that fits 50+ compact cards; each shows price, 24h %, and an inline-SVG sparkline.
- **Glance emphasis:** card glow scales with the size of the 24h move; toggle **Sort by movement**.
- Add / delete (right-click menu) / drag-reorder cards; order persists server-side.
- **Group colour:** right-click a card to set one of 5 left-border colours (default black).
- **Collapse same pair** across exchanges into one block (`−` / `+`).
- **Candle chart popup:** `📈` opens a 5m / 3h candlestick (lightweight-charts, code-split and
  loaded on demand).
- Pairs that don't exist on an exchange are auto-dropped; unsupported exchanges
  (Bitunix, CrossX, OFZA, Weex) are skipped.

## Layout

- `server/` — Express API + 60s poller + in-memory cache + CCXT adapters.
- `web/` — Svelte frontend (Vite build).
- `data/watchlist.example.json` — committed seed; `data/watchlist.json` — your gitignored list.

## Scripts

- `npm run serve` — build frontend + start server
- `npm run build` / `npm start` — build only / serve last build
- `npm run dev:web` — Vite dev server (HMR, proxies `/api` to :3000)

`PORT` env var overrides the default 3000.
# Authentication

The server requires two environment variables:

```text
WATCHLIST_PIN=123456
READONLY_PIN=654321
AUTH_SECRET=a-long-random-secret-of-at-least-32-characters
```

Set `NODE_ENV=production` when serving over HTTPS so the session cookie is marked `Secure`.
The production cookie uses the host-only `__Host-` prefix, so it is scoped to
`wl.proofnest.org` and is not shared with other `proofnest.org` subdomains.
Five failed PIN attempts from one IP cause a 15-minute lockout. If the reverse proxy
does not connect directly to Node, set `TRUST_PROXY_HOPS` to the exact proxy hop count.
`WATCHLIST_PIN` grants editing access. `READONLY_PIN` opens the same watchlist while the
server rejects all add, delete, reorder, and colour-change requests.
