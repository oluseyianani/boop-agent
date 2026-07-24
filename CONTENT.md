# Content desk (fork-local feature)

This fork embeds the Twizle content operation (previously the standalone
`content-agent` repo) inside Boop. The desk's concepts — a doctrine-gated
idea bank where every idea names its enemy, faceless scripts with UGC
briefs, a planner calendar with idea cooldowns, and a content log of every
published execution — live in Convex tables and a **Content** tab in the
debug dashboard.

## Status: phase 1 (read + mark-posted)

- [x] Convex tables (`convex/contentSchema.ts`) + functions (`convex/content.ts`)
- [x] One-shot importer from the old desk (`scripts/content-import.ts`)
- [x] Content tab: weekly calendar with per-platform mark-posted, idea bank
      with cooldown state, content log
- [x] Phase 2: the weekly engine in `server/content/` — Apify pull (with
      freshness TTLs, blocked-handle cooldowns, og: fallback), Instagram
      caption auto-matching, doctrine-prompted bank refresh via headless
      `claude -p` (validation rails, frozen hooks, keep-old-bank-on-failure),
      deterministic LRU planner, Telegram digest. Scheduled by croner
      (Mondays 08:00 Europe/London) ONLY where `CONTENT_ENGINE=1` (trolley's
      systemd unit); "Run now" + enable toggle in the Content tab.
      Env: `APIFY_TOKEN`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`,
      optional `CONTENT_DOCTRINE_DIR` / `CONTENT_CRON` / `REFRESH_MODEL`.
- [ ] Phase 3: retire the old content-agent cron on the server (engine
      replaces it; old repo remains the doctrine home)
- [ ] Phase 4 (optional): iMessage the desk via the interaction agent
      (content tools: today's slots, mark posted, draft DM replies)

## Setup

```bash
npx convex dev            # once — provisions deployment, generates convex/_generated
npx tsx scripts/content-import.ts ~/content-agent/projects/twizle
npm run dev               # Content tab appears in the debug dashboard
```

The importer is idempotent — re-run it any time; posted slots are immutable
and log rows dedup.

## Fork-sync contract (IMPORTANT)

This fork tracks upstream (`raroque/boop-agent`). To keep merges trivial,
content-desk code is **additive-only**:

New files (never conflict):
- `convex/contentSchema.ts`, `convex/content.ts`
- `server/content/` (engine: pull, match, refresh, validate, planner,
  digest, runner, routes)
- `debug/src/components/ContentPanel.tsx`
- `scripts/content-import.ts`
- `CONTENT.md`, `FORK.md`, `deploy/`

Upstream files touched — the ONLY possible conflict points, each a
one-or-two-line mechanical hook. If a merge ever mangles them, re-apply
from this list:

| File | Hook |
|---|---|
| `convex/schema.ts` | `import { contentTables } from "./contentSchema";` + `...contentTables,` as the first entry in `defineSchema({...})` |
| `debug/src/App.tsx` | `Calendar03Icon` in the icon import; `ContentPanel` import; `"content"` in the `View` union; `content: Calendar03Icon` in `NAV_ICONS`; `{ id: "content", label: "Content" }` in `NAV`; `{view === "content" && <ContentPanel isDark={isDark} />}` in the render switch |
| `server/index.ts` | `import { createContentRouter, startContentEngine } from "./content/index.js";`; `startContentEngine();` after the other `start*Loop()` calls; `app.use("/content", createContentRouter());` after the `/health` route |

Sync workflow:

```bash
git fetch upstream
git merge upstream/main      # conflicts, if any, only in the two files above
npm run typecheck && npm run test
git push origin main
```

Never edit upstream files for content-desk features beyond those hooks —
put new behavior in the content files, or (phase 2) in `server/content/`.

## Data model

`contentProjects` (config mirrors old project.json) · `contentIdeas`
(+creative pack blob) · `contentScripts` (hooks/beats/cta/ugcBrief) ·
`contentSlots` (calendar; immutable once posted) · `contentLog` (drives
cooldowns; shortcode links Instagram auto-matches).

Doctrine (positioning, voice, per-project marketing context) intentionally
stays in the old repo's markdown files and the app repo's
`.specify/memory/*` — phase 2's refresh agent reads them at run time;
they are not duplicated into Convex.
