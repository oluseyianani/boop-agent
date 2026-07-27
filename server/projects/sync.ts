// Repo-sync: the "auto" half of the hybrid freshness model. For each project
// with a repoPath on this machine, derive current context from git + the
// README + a live-URL health check and push it to the project registry as
// source="auto" — so it never clobbers fields the user pinned manually
// (see convex/projects.ts upsert). Runs wherever the repos live (the Mac),
// either on demand via /projects/sync or on a schedule via
// scripts/project-sync.ts.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { api } from "../../convex/_generated/api.js";
import { convex } from "../convex-client.js";

const exec = promisify(execFile);
const RECENT_TASK_WINDOW_MS = 60 * 864e5; // 60 days
const README_CANDIDATES = ["README.md", "CONTEXT.md", "CONTENT.md", "readme.md"];
// Unit-separator delimiter for the git log format — safe because commit
// subjects never contain it.
const SEP = "\x1f";

interface ProjectDoc {
  projectId: string;
  repoPath?: string;
  liveUrl?: string;
  lastSyncedAt?: number;
}

export interface SyncResult {
  projectId: string;
  ok: boolean;
  detail: string;
}

async function git(repo: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await exec("git", ["-C", repo, ...args], {
      timeout: 10_000,
      maxBuffer: 1 << 20,
    });
    return stdout.trim();
  } catch {
    return null;
  }
}

// First plain-prose line of the README — skips headings, badges, HTML, and
// blank lines. Used as a fallback summary only; a manual summary always wins.
async function readmeSummary(repo: string): Promise<string | null> {
  for (const candidate of README_CANDIDATES) {
    let text: string;
    try {
      text = await readFile(join(repo, candidate), "utf8");
    } catch {
      continue;
    }
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      if (!line) continue;
      if (line.startsWith("#") || line.startsWith("<") || line.startsWith("![")) continue;
      if (line.startsWith("[!") || line.startsWith(">")) continue;
      const clean = line.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1"); // strip md links
      if (clean.length >= 20) return clean.slice(0, 240);
    }
  }
  return null;
}

async function checkLive(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    // HEAD first; some hosts reject HEAD, so fall back to GET.
    let res = await fetch(url, { method: "HEAD", signal: controller.signal });
    if (res.status === 405 || res.status === 501) {
      res = await fetch(url, { method: "GET", signal: controller.signal });
    }
    return res.status < 400;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function syncOneProject(projectId: string): Promise<SyncResult> {
  const project = (await convex.query(api.projects.get, { projectId })) as ProjectDoc | null;
  if (!project) return { projectId, ok: false, detail: "not found" };
  const repo = project.repoPath;
  if (!repo) return { projectId, ok: false, detail: "no repoPath" };

  try {
    const s = await stat(repo);
    if (!s.isDirectory()) return { projectId, ok: false, detail: "repoPath is not a directory" };
  } catch {
    return { projectId, ok: false, detail: `repoPath not found: ${repo}` };
  }

  const now = Date.now();
  const branch = (await git(repo, ["rev-parse", "--abbrev-ref", "HEAD"])) || undefined;
  const version = (await git(repo, ["describe", "--tags", "--abbrev=0"])) || undefined;

  // Recent commit subjects → recentTasks (merged + deduped in the mutation).
  const log = await git(repo, [
    "log",
    "-n",
    "30",
    "--no-merges",
    `--pretty=format:%ct${SEP}%s`,
  ]);
  const cutoff = Math.max(
    now - RECENT_TASK_WINDOW_MS,
    project.lastSyncedAt ? project.lastSyncedAt - 864e5 : 0,
  );
  const recentTasks = (log ?? "")
    .split("\n")
    .map((line) => {
      const [ct, ...rest] = line.split(SEP);
      const at = Number(ct) * 1000;
      return { summary: rest.join(SEP).trim(), at };
    })
    .filter((t) => t.summary && Number.isFinite(t.at) && t.at >= cutoff)
    .slice(0, 15);

  const summary = (await readmeSummary(repo)) ?? undefined;

  let live: boolean | undefined;
  let healthCheckedAt: number | undefined;
  if (project.liveUrl) {
    live = await checkLive(project.liveUrl);
    healthCheckedAt = now;
  }

  await convex.mutation(api.projects.upsert, {
    source: "auto",
    projectId,
    branch,
    version,
    ...(summary ? { summary } : {}),
    ...(recentTasks.length ? { recentTasks } : {}),
    ...(live !== undefined ? { live } : {}),
    ...(healthCheckedAt ? { healthCheckedAt } : {}),
    lastSyncedAt: now,
  });

  const bits = [
    branch ? `branch ${branch}` : null,
    version ?? null,
    recentTasks.length ? `${recentTasks.length} tasks` : null,
    live !== undefined ? (live ? "live ✓" : "live ✗") : null,
  ].filter(Boolean);
  return { projectId, ok: true, detail: bits.join(", ") || "synced" };
}

export async function syncAllProjects(): Promise<SyncResult[]> {
  const projects = (await convex.query(api.projects.list, {})) as ProjectDoc[];
  const out: SyncResult[] = [];
  for (const p of projects) {
    // Sequential: git spawns + network pings; no need to hammer the box.
    out.push(await syncOneProject(p.projectId));
  }
  return out;
}
