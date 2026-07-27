// Mac-side repo-sync runner — the scheduled "auto" half of project freshness.
// Runs where the repos live: reads each registered project's repoPath, derives
// current context (git branch/version/recent commits + README summary +
// live-URL health check) and pushes it to Convex as source="auto" so it never
// overwrites fields you pinned manually in chat or the Projects UI.
//
// Usage:
//   npm run projects:sync        # run once, then schedule (PROJECT_SYNC_CRON)
//   npm run projects:sync -- --once   # run once and exit (good for cron/CI)
//
// Env (all optional):
//   PROJECT_SYNC_CRON   cron expression (default: every 6 hours)
//   PROJECT_SYNC_TZ     IANA timezone for the schedule (default: system)
//
// Requires .env.local (VITE_CONVEX_URL) and convex/_generated, same as the
// other scripts.

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import { Cron } from "croner";

// Imported dynamically (after loadEnv) — server/projects/sync pulls in
// convex-client, which reads VITE_CONVEX_URL at module load and throws if it's
// missing. Static ESM imports are hoisted above loadEnv, so a top-level import
// would evaluate before the env file is read.
type SyncAll = typeof import("../server/projects/sync.js").syncAllProjects;

const SCHEDULE = process.env.PROJECT_SYNC_CRON ?? "0 */6 * * *";
const TIMEZONE = process.env.PROJECT_SYNC_TZ;

let syncAllProjects: SyncAll;

async function runOnce(): Promise<void> {
  const startedAt = new Date().toISOString();
  console.log(`[project-sync] run starting ${startedAt}`);
  try {
    const results = await syncAllProjects();
    if (results.length === 0) {
      console.log("[project-sync] no projects registered — nothing to do");
      return;
    }
    for (const r of results) {
      console.log(`[project-sync]   ${r.ok ? "✓" : "–"} ${r.projectId}: ${r.detail}`);
    }
    const synced = results.filter((r) => r.ok).length;
    console.log(`[project-sync] done — ${synced}/${results.length} synced`);
  } catch (err) {
    console.error("[project-sync] run failed:", err);
  }
}

async function main(): Promise<void> {
  const once = process.argv.includes("--once");
  ({ syncAllProjects } = await import("../server/projects/sync.js"));
  await runOnce();
  if (once) return;

  new Cron(SCHEDULE, TIMEZONE ? { timezone: TIMEZONE } : {}, () => void runOnce());
  console.log(
    `[project-sync] scheduled "${SCHEDULE}"${TIMEZONE ? ` (${TIMEZONE})` : ""} — leave this running`,
  );
}

void main();
