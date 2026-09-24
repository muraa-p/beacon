# Beacon

**Open-source uptime monitoring and status pages. Self-hosted, zero cost.**

Beacon watches your websites and APIs, records their uptime, and publishes a beautiful public status page for your users — all from a single command. No subscriptions, no vendor lock-in, no data leaving your server.

```
🟢  All Systems Operational
```

## Features

- ⏱ **Uptime monitoring** — HTTP(S) checks on an interval you choose (GET / HEAD / POST)
- 📊 **Uptime history** — 24h / 7d / 30d / 90d percentages per monitor
- 🌐 **Public status page** — a clean, mobile-friendly page served at `/`
- 🔔 **Notifications** — webhook (any JSON endpoint) + SMTP email alerts on down/recover
- 📈 **Incident timeline** — automatic down/up events with durations
- 🧠 **AI incident reporter** — every outage gets automatic forensics: DNS, TLS, certificate expiry, HTTP, and flapping analysis, summarized as *"what we think happened"* — with an optional AI-written report if you add an `OPENAI_API_KEY`
- 🎯 **Attack forensics** — HTTP 403/WAF-challenge and on-off flapping patterns are flagged as *possible attack signals* on incidents
- 🔐 **Single-admin auth** — sessions, PBKDF2-hashed passwords, no accounts-as-a-service
- 🐳 **One-command self-host** — `docker compose up`
- 💾 **Zero external dependencies** — SQLite built into Node, one volume, that's it
- 📦 **MIT licensed** — fork it, modify it, run your own version

## Quick start

### Docker (recommended)

```bash
docker compose up -d
```

Open http://localhost:8080 — the status page. Sign in at `/dashboard` (default user `admin`, password `change-me-please` — change it in `docker-compose.yml`).

### From source

Requires [Node.js 24+](https://nodejs.org).

```bash
git clone https://github.com/muraa-p/beacon.git
cd beacon
npm install
npm run build
npm start
```

On first run a random admin password is printed to the console. Or set it yourself:

```bash
ADMIN_PASSWORD=supersecret npm start
```

### Development

```bash
npm run dev
```

- API + status page: http://localhost:8080
- Dashboard with hot reload: http://localhost:5173

## Configuration

All configuration is via environment variables (see `.env.example`):

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8080` | Port to listen on |
| `DATA_DIR` | `./data` | Where the SQLite database lives |
| `ADMIN_USER` | `admin` | First admin username (first run only) |
| `ADMIN_PASSWORD` | random | First admin password (first run only) |
| `PUBLIC_URL` | `http://localhost:8080` | Base URL used in notification links |
| `OPENAI_API_KEY` | – | Optional: enables AI-written incident reports alongside rule-based diagnoses |
| `LLM_MODEL` | `gpt-4o-mini` | Model used for AI incident reports (only when key is set) |

## Incident intelligence

When a monitor goes down, Beacon runs a short forensic pass and stores the result on the incident:

- **DNS probe** — does the hostname still resolve?
- **TLS/certificate probe** (HTTPS) — handshake health and days-to-expiry
- **HTTP probe** — what the server actually answered (4xx/5xx/403/timeout)
- **Recovery probe** — did it recover moments later (transient!)
- **History pattern** — success rate before the failure and rapid on-off *flapping*

These are combined into a plain-language diagnosis with a confidence level, shown on the public status page and in the dashboard. Diagnoses that smell like an attack — HTTP 403 WAF challenges or flapping — are flagged with a ⚠ *possible attack* badge. Notifications include the diagnosis, so your phone tells you *what likely broke*, not just *that* something broke.

Everything is rule-based and runs locally — zero external calls. Set an `OPENAI_API_KEY` to have the diagnosis handed to an LLM for a polished one-paragraph incident report.

## Architecture

```
beacon/
├── server/          # Express + TypeScript API, checker, notifier
│   └── src/
│       ├── config.ts      # environment config
│       ├── db.ts          # SQLite (node:sqlite) + migrations
│       ├── auth.ts        # PBKDF2 passwords + sessions
│       ├── checker.ts     # background uptime checker
│       ├── diagnostics.ts # incident forensics + diagnosis scoring
│       ├── notify.ts      # webhook + email alerts
│       ├── settings.ts    # app settings storage
│       ├── api.ts         # REST API (JSON)
│       ├── statuspage.ts  # server-rendered public page
│       ├── app.ts         # express app assembly
│       └── index.ts       # entry point
├── client/          # React + Vite admin dashboard
└── .github/         # CI, issue templates, PR template
```

- **Storage:** SQLite with WAL, schema versioned via `PRAGMA user_version` migrations.
- **Checker:** wakes on a tick, runs due monitors with a small concurrency pool, records every check, emits events on state transitions, prunes old checks.
- **Status page:** server-rendered (works with JS disabled), auto-refreshes every 60s.
- **Dashboard:** React SPA served from `/dashboard`; talks to `/api/*`.

## API overview

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/login` | – | Sign in, sets session cookie |
| `POST` | `/api/logout` | – | Sign out |
| `GET` | `/api/me` | – | Current user |
| `GET` | `/api/monitors` | ✓ | List monitors with uptime |
| `POST` | `/api/monitors` | ✓ | Create monitor |
| `GET/PUT/DELETE` | `/api/monitors/:id` | ✓ | Read / update / delete |
| `GET` | `/api/monitors/:id/checks` | ✓ | Check history |
| `GET` | `/api/monitors/:id/events` | ✓ | Incident history |
| `GET/PUT` | `/api/settings` | ✓ | App settings |
| `GET` | `/api/public/status` | – | Public status JSON |

## Contributing

Contributions welcome! Read [CONTRIBUTING.md](CONTRIBUTING.md) first — it covers setup, code style, and how to submit a PR. Look for issues labeled [`good first issue`](../../labels/good%20first%20issue) to get started.

## License

[MIT](LICENSE) — use it, fork it, make it yours. Attribution via the copyright notice is appreciated.

---

<p align="center">Built for people who want uptime monitoring without a monthly bill.</p>