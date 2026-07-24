// One-shot importer: old content-agent desk -> Convex content tables.
// Re-runnable: every write is an idempotent upsert (slots keep posted
// history immutable; log rows dedup on shortcode).
//
// Usage:
//   npx tsx scripts/content-import.ts [projectDir]
//   npx tsx scripts/content-import.ts ~/content-agent/projects/twizle
//
// Requires `npx convex dev` to have run at least once (VITE_CONVEX_URL in
// .env.local + convex/_generated present). Reads:
//   projectDir/project.json        -> contentProjects
//   projectDir/content-bank.json   -> contentIdeas + contentScripts
//   projectDir/data.db (sqlite)    -> contentSlots + contentLog

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

const url = process.env.CONVEX_URL ?? process.env.VITE_CONVEX_URL;
if (!url) {
  console.error("Convex URL is not set. Run `npx convex dev` once, then retry.");
  process.exit(1);
}
const convex = new ConvexHttpClient(url);

const projectDir = path.resolve(
  (process.argv[2] ?? path.join(homedir(), "content-agent", "projects", "twizle")).replace(
    /^~(?=\/)/,
    homedir(),
  ),
);
const projectId = path.basename(projectDir);

function readJson(file: string) {
  return JSON.parse(readFileSync(path.join(projectDir, file), "utf8"));
}

const toMs = (iso: string | null | undefined): number | undefined => {
  if (!iso) return undefined;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? undefined : ms;
};

async function main() {
  const project = readJson("project.json");
  const bank = readJson("content-bank.json");

  // ---- project ----
  const { name = projectId } = project;
  await convex.mutation(api.content.upsertProject, {
    projectId,
    name,
    config: JSON.stringify(project),
    dmPlaybook: bank.dmPlaybook ? JSON.stringify(bank.dmPlaybook) : undefined,
    bankVersion: typeof bank.version === "number" ? bank.version : undefined,
    bankRefreshedAt: toMs(bank.updatedAt),
  });
  console.log(`project: ${projectId} ("${name}")`);

  // ---- ideas (+ creative packs) ----
  const creative = bank.creative ?? {};
  for (const idea of bank.ideas ?? []) {
    await convex.mutation(api.content.upsertIdea, {
      projectId,
      ideaId: idea.id,
      title: idea.title ?? idea.id,
      enemy: idea.enemy ?? "",
      retired: Boolean(idea.retired),
      data: JSON.stringify(idea),
      creative: creative[idea.id] ? JSON.stringify(creative[idea.id]) : undefined,
    });
  }
  console.log(`ideas: ${(bank.ideas ?? []).length}`);

  // ---- scripts ----
  for (const script of bank.scripts ?? []) {
    await convex.mutation(api.content.upsertScript, {
      projectId,
      ideaId: script.ideaId,
      data: JSON.stringify(script),
    });
  }
  console.log(`scripts: ${(bank.scripts ?? []).length}`);

  // ---- sqlite: planned slots + content log ----
  const dbPath = path.join(projectDir, "data.db");
  if (!existsSync(dbPath)) {
    console.log("no data.db found — skipping slots and log");
    return;
  }
  const db = new DatabaseSync(dbPath);

  const slots = db
    .prepare("SELECT * FROM planned_slots ORDER BY slot_date, slot_time")
    .all() as Array<Record<string, unknown>>;
  for (const s of slots) {
    await convex.mutation(api.content.upsertSlot, {
      projectId,
      slotDate: String(s.slot_date),
      slotTime: String(s.slot_time),
      ideaId: String(s.idea_id ?? ""),
      title: s.title ? String(s.title) : undefined,
      enemy: s.enemy ? String(s.enemy) : undefined,
      format: s.format ? String(s.format) : undefined,
      scripted: Boolean(s.scripted),
      plannedAt: toMs(s.planned_at as string) ?? Date.now(),
      postedAt: toMs(s.posted_at as string),
      postedVia: s.posted_via ? String(s.posted_via) : undefined,
    });
  }
  console.log(`slots: ${slots.length}`);

  const logs = db
    .prepare("SELECT * FROM content_log ORDER BY posted_at")
    .all() as Array<Record<string, unknown>>;
  let imported = 0;
  for (const l of logs) {
    const postedAt = toMs(l.posted_at as string);
    if (!postedAt || !l.idea_id) continue;
    await convex.mutation(api.content.addLog, {
      projectId,
      ideaId: String(l.idea_id),
      format: l.format ? String(l.format) : undefined,
      platform: String(l.platform ?? "all"),
      shortcode: l.shortcode ? String(l.shortcode) : undefined,
      source: "import",
      postedAt,
    });
    imported++;
  }
  console.log(`log rows: ${imported}`);
  db.close();

  console.log("done — open the Content tab in the debug dashboard.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
