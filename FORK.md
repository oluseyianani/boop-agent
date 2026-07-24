# This fork: Boop + the Twizle content desk

> Fork-local documentation. Upstream's own docs are README.md /
> ARCHITECTURE.md — this file is deliberately separate so upstream merges
> never touch it. Feature contract and touchpoint list: [CONTENT.md](CONTENT.md).

## What this fork is

`oluseyianani/boop-agent`, tracking `raroque/boop-agent` (`upstream`), plus
one fork-local feature: the **content desk** — the Twizle content
operation that previously lived in the standalone `content-agent` repo
(six-agent desk: Analyst, Ideator, Hook & Script, Creative Director,
Planner, DM Manager), embedded as a Content tab and Convex tables.

The desk's doctrine (one enemy per piece, attack the failure moment,
faceless production, voice rules) stays in the `content-agent` repo's
markdown and the app repo's `.specify/memory/*` — agents read it at run
time; it is not duplicated here.

## What was added (all fork-local)

| Piece | Where |
|---|---|
| Convex tables: projects, ideas (+creative packs), scripts, calendar slots, content log | `convex/contentSchema.ts` (spread into `schema.ts`) |
| Queries/mutations incl. `markSlotPosted` (stamps slot + writes the cooldown-driving log row; posted slots immutable) | `convex/content.ts` |
| Content tab: weekly calendar with per-platform mark-posted, idea bank with cooldown state, content log | `debug/src/components/ContentPanel.tsx` |
| Idempotent importer from the old desk (project.json, content-bank.json, data.db) | `scripts/content-import.ts` |
| Trolley deployment files | `deploy/` |

## Development (Mac)

```bash
npm run setup                                            # once: Convex + runtime
npx tsx scripts/content-import.ts ~/content-agent/projects/twizle
npm run dev                                              # dashboard on :5173
```

## Deploying to trolley

Design: trolley is a **pure Convex client** — it never holds Convex
credentials. `.env.local` (deployment URL) and `convex/_generated/`
(types) are copied from the Mac; Convex function changes are pushed from
the Mac via `npx convex dev`. The Boop server runs under systemd on
:3456; the dashboard is a static build served by Caddy at
https://trolley.oluseyi.dev behind the existing basic auth.

1. **Deploy key** (per-repo, same pattern as the other repos):
   ```bash
   ssh-keygen -t ed25519 -C "trolley boop deploy" -f ~/.ssh/id_ed25519_boop -N ""
   cat ~/.ssh/id_ed25519_boop.pub   # add: fork repo → Settings → Deploy keys (read-only)
   cat >> ~/.ssh/config <<'EOF'
   Host github-boop
     HostName github.com
     IdentityFile ~/.ssh/id_ed25519_boop
     IdentitiesOnly yes
   EOF
   git clone git@github-boop:oluseyianani/boop-agent.git ~/apps/boop-agent
   cd ~/apps/boop-agent && npm ci
   ```
2. **Copy the two gitignored pieces from the Mac:**
   ```bash
   scp ~/www/boop-agent/.env.local oluseyi@167.233.223.193:apps/boop-agent/
   scp -r ~/www/boop-agent/convex/_generated oluseyi@167.233.223.193:apps/boop-agent/convex/
   ```
3. **Build the dashboard** (bakes VITE_CONVEX_URL from .env.local):
   ```bash
   npm run build:debug
   ```
4. **Server as systemd unit:**
   ```bash
   sudo cp deploy/boop-server.service /etc/systemd/system/
   sudo systemctl daemon-reload && sudo systemctl enable --now boop-server
   curl -s localhost:3456/health
   ```
5. **Caddy:** replace the old `trolley.oluseyi.dev` block with
   `deploy/Caddyfile.snippet` (keep the existing bcrypt hash), then
   `sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy`.
6. **Verify:** https://trolley.oluseyi.dev → basic auth → Content tab.

Redeploy after code changes:

```bash
cd ~/apps/boop-agent && git pull && npm ci && npm run build:debug && sudo systemctl restart boop-server
```

## Phase 2 on trolley: the weekly engine

The engine (pull → match → refresh → plan → digest) lives in
`server/content/` and replaces the old repo's Monday cron. Deploying it:

```bash
# on trolley
cd ~/apps/boop-agent && git pull && npm ci && npm run build:debug
# append the engine's secrets to .env.local (values from the old
# ~/apps/content-agent/.env — APIFY_TOKEN, TELEGRAM_BOT_TOKEN,
# TELEGRAM_CHAT_ID):
grep -E "^(APIFY_TOKEN|TELEGRAM_BOT_TOKEN|TELEGRAM_CHAT_ID)=" \
  ~/apps/content-agent/.env >> ~/apps/boop-agent/.env.local
sudo cp deploy/boop-server.service /etc/systemd/system/   # now sets CONTENT_ENGINE=1
sudo systemctl daemon-reload && sudo systemctl restart boop-server
```

From the Mac (the Convex schema changed, so regenerate + re-copy types):

```bash
scp -r ~/www/boop-agent/convex/_generated oluseyi@167.233.223.193:apps/boop-agent/convex/
```

Then **retire the old cron** (phase 3): `crontab -e`, delete the Monday
bridge line (keep the nightly data.db backup line until comfortable).
The doctrine files in `~/apps/content-agent` stay — the refresh step
reads them at run time (override location with `CONTENT_DOCTRINE_DIR`).

Verify: Content tab → Weekly engine card shows "Scheduled 0 8 * * 1
(Europe/London)" → hit **Run now** and watch the step log fill in live.

## Migration state and the bridge (historical — superseded by phase 2)

Phase 1 replaces the old desk's **dashboard** (the old serve.js on :4611
is decommissioned). The old desk's **weekly engine** (Apify pull → Claude
bank refresh → planner → Telegram digest, Mondays 08:00 via cron in
`~/apps/content-agent`) keeps running until phase 2 exists — it is still
the only thing producing fresh data. The bridge: the weekly cron chains
the importer after the old loop, so Convex (and this dashboard) stay
current:

```
0 8 * * 1 cd /home/oluseyi/apps/content-agent && /usr/bin/node scripts/weekly-run.js >> logs/cron.log 2>&1 && cd /home/oluseyi/apps/boop-agent && /usr/bin/node node_modules/.bin/tsx scripts/content-import.ts /home/oluseyi/apps/content-agent/projects/twizle >> /home/oluseyi/apps/content-agent/logs/cron.log 2>&1
```

Mark-posted now happens ONLY in the new dashboard (the old one is gone).
The old SQLite content log is frozen at import time; Convex is the
source of truth for anything after the cutover.

## Roadmap

- **Phase 2** — port the weekly engine into this repo: Apify pull as a
  server module, bank refresh as a doctrine-prompted execution agent,
  planner as deterministic code, all wired as Boop automations
  (toggleable in the UI, results notifiable). Instagram auto-matching
  moves here too.
- **Phase 3** — retire `~/apps/content-agent`'s cron entirely (repo stays
  as the doctrine home), remove the bridge.
- **Phase 4 (optional)** — Sendblue/iMessage: text the desk ("today's
  three concepts?", "mark the reel posted"), DM Manager drafts via Boop's
  draft-and-send.

## Syncing with upstream

```bash
git fetch upstream
git merge upstream/main   # conflicts only possible at the two hooks in CONTENT.md
npm run typecheck && npm run test
git push origin main
```
