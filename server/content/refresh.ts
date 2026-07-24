// Weekly LLM refresh of the content bank — port of content-agent's
// refresh-ideas.js. Same safety rails: deterministic validation with one
// retry (errors quoted back), hooks/CTAs of published ideas frozen, and on
// any failure the existing bank is kept untouched.
//
// The doctrine stays as markdown in the old content-agent repo (see
// CONTENT.md) and is read at run time from CONTENT_DOCTRINE_DIR.

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { convex } from "../convex-client.js";
import { api } from "../../convex/_generated/api.js";
import { validateBank, ALLOWED_ENEMIES } from "./validate.js";
import type { Bank, BankIdea, BankScript, ContentProjectRow, ProjectConfig } from "./types.js";

function doctrineDir(): string {
  const fromEnv = process.env.CONTENT_DOCTRINE_DIR;
  if (fromEnv) return fromEnv.replace(/^~(?=\/)/, homedir());
  for (const candidate of [
    path.join(homedir(), "apps", "content-agent"),
    path.join(homedir(), "content-agent"),
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error("content-agent repo not found — set CONTENT_DOCTRINE_DIR");
}

function readDoctrine(projectId: string): string {
  const root = doctrineDir();
  const parts: string[] = [];
  for (const file of [
    path.join(root, "CLAUDE.md"),
    path.join(root, "projects", projectId, "product-marketing.md"),
  ]) {
    if (existsSync(file)) parts.push(readFileSync(file, "utf8"));
  }
  if (!parts.length) throw new Error(`no doctrine files under ${root}`);
  return parts.join("\n\n---\n\n");
}

function findClaude(): string {
  if (process.env.CLAUDE_BIN && existsSync(process.env.CLAUDE_BIN)) return process.env.CLAUDE_BIN;
  const candidates = [
    "/opt/homebrew/bin/claude",
    "/usr/local/bin/claude",
    path.join(homedir(), ".claude", "local", "claude"),
    path.join(homedir(), ".local", "bin", "claude"),
  ];
  return candidates.find((c) => existsSync(c)) ?? "claude";
}

function callClaude(input: string): Promise<string> {
  const bin = findClaude();
  const model = process.env.REFRESH_MODEL ?? "sonnet";
  console.log(`[content:refresh] calling ${bin} (model: ${model})…`);
  return new Promise((resolve, reject) => {
    const child = spawn(bin, ["-p", "--model", model], { env: process.env });
    let out = "";
    let err = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), 10 * 60 * 1000);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out);
      else reject(new Error(`claude exited ${code}: ${err.slice(0, 400)}`));
    });
    child.stdin.write(input);
    child.stdin.end();
  });
}

function parseBank(text: string): Bank {
  const cleaned = text.replace(/^```(json)?/gm, "").replace(/```$/gm, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < 0) throw new Error("no JSON object in response");
  return JSON.parse(cleaned.slice(start, end + 1)) as Bank;
}

// Reconstruct the current bank from Convex rows (the inverse of applyBank).
async function loadBank(project: ContentProjectRow): Promise<Bank> {
  const ideaRows = (await convex.query(api.content.listIdeas, {
    projectId: project.projectId,
  })) as { ideaId: string; retired: boolean; data: string; creative?: string }[];
  const scriptRows = (await convex.query(api.content.listScripts, {
    projectId: project.projectId,
  })) as { data: string }[];
  const creative: Record<string, unknown> = {};
  for (const r of ideaRows) {
    if (r.creative) creative[r.ideaId] = JSON.parse(r.creative);
  }
  return {
    version: project.bankVersion ?? 1,
    updatedAt: project.bankRefreshedAt
      ? new Date(project.bankRefreshedAt).toISOString()
      : undefined,
    refreshedBy: "llm",
    ideas: ideaRows.map((r) => ({ ...(JSON.parse(r.data) as BankIdea), retired: r.retired })),
    scripts: scriptRows.map((r) => JSON.parse(r.data) as BankScript),
    creative,
    dmPlaybook: project.dmPlaybook ? JSON.parse(project.dmPlaybook) : [],
  };
}

async function buildPrompt(
  project: ContentProjectRow,
  config: ProjectConfig,
  bank: Bank,
): Promise<{ prompt: string; frozenIds: string[] }> {
  const projectId = project.projectId;
  const doctrine = readDoctrine(projectId);
  const own = config.instagramHandle.toLowerCase();
  const myProfile = (await convex.query(api.content.getProfile, {
    projectId,
    handle: own,
  })) as { followers?: number } | null;
  const myPosts = (await convex.query(api.content.listPosts, {
    projectId,
    ownerHandle: own,
  })) as { type?: string; score: number; caption?: string }[];
  const usage = (await convex.query(api.content.ideaUsage, { projectId })) as Record<
    string,
    { timesUsed: number; lastPostedAt: number }
  >;

  const compDigest: string[] = [];
  for (const c of config.competitors ?? []) {
    const posts = (await convex.query(api.content.listPosts, {
      projectId,
      ownerHandle: c.handle.toLowerCase(),
    })) as { type?: string; score: number; caption?: string }[];
    const profile = (await convex.query(api.content.getProfile, {
      projectId,
      handle: c.handle.toLowerCase(),
    })) as { followers?: number } | null;
    compDigest.push(
      `@${c.handle} (${profile?.followers ?? "?"} followers):\n` +
        posts
          .slice(0, 8)
          .map(
            (p) =>
              `  - [${p.type}, score ${p.score}] ${[...String(p.caption ?? "")].slice(0, 150).join("").replace(/\n/g, " ")}`,
          )
          .join("\n"),
    );
  }

  const usageDigest =
    Object.entries(usage)
      .map(([id, u]) => `  - ${id}: posted ×${u.timesUsed}, last ${new Date(u.lastPostedAt).toISOString()}`)
      .join("\n") || "  (nothing published from the bank yet)";
  const frozenIds = Object.keys(usage);

  const prompt = `You are the weekly refresh for a content desk. Your ONLY output must be a
single JSON object — no prose, no markdown fences, no commentary.

THE DESK'S STANDING INSTRUCTIONS (doctrine, voice, production model):
---
${doctrine}
---

CURRENT STATE
My account: @${config.instagramHandle}, ${myProfile?.followers ?? "?"} followers.
My recent post captions:
${myPosts.map((p) => `  - [${p.type}, score ${p.score}] ${[...String(p.caption ?? "")].slice(0, 120).join("")}`).join("\n") || "  (none)"}

Competitors' top recent posts THIS WEEK (what the niche is rewarding):
${compDigest.join("\n")}

Published usage from the content log:
${usageDigest}

CURRENT CONTENT BANK (the JSON you must return an evolved version of):
${JSON.stringify(bank, null, 1)}

YOUR TASKS
1. Ideas: keep the bank at 10-14 active ideas. Retire tired ones by setting
   "retired": true (never delete). Add new ideas inspired by what competitor
   posts scored well this week — every new idea needs id (kebab-case), title,
   enemy (EXACTLY one of: ${ALLOWED_ENEMIES.join(" | ")}), failureMoment,
   formats (subset of reel/carousel/image, best first), angle (faceless
   execution in one sentence), keywords (for evidence matching).
2. Scripts: every unretired idea should eventually have a script. Write
   scripts for up to 2 unscripted ideas: exactly 3 hooks, 3-5 timed beats
   (all faceless: screens, hands, captions, VO), a cta ending "Link in bio.",
   and a ugcBrief a creator can follow verbatim.
3. Creative: every unretired idea needs a creative pack: 1-3 genPrompts
   (label + prompt; every prompt must include the accent "#08A00E" and the
   words "no people" or "no faces"; specify aspect ratio) and an assets list.
   Write ONLY the visual composition (layout, objects, exact quoted text to
   render, lighting) — product context, brand system and render rules are
   wrapped around your prompt automatically at export time, so do not repeat
   them.
4. dmPlaybook: leave unchanged unless a template is factually wrong.

HARD CONSTRAINTS
- FROZEN: ideas ${frozenIds.length ? frozenIds.join(", ") : "(none yet)"} have published posts — do not
  change their hooks or cta AT ALL (caption matching depends on exact text).
- Voice: no banned words/phrases from the instructions above, no emoji
  anywhere, at most ONE em dash per string, no "not just X, but Y", numbers
  beat adjectives, sentence case.
- One enemy per idea. UK context, £ prices.
- Return the COMPLETE bank object: {version, updatedAt, refreshedBy:"llm",
  ideas, scripts, creative, dmPlaybook}. Keep existing idea ids stable.`;

  return { prompt, frozenIds };
}

// Freeze published hooks/CTAs regardless of what the model returned.
function enforceFrozen(next: Bank, prev: Bank, frozenIds: string[]): Bank {
  for (const id of frozenIds) {
    const prevScript = prev.scripts.find((s) => s.ideaId === id);
    if (!prevScript) continue;
    const idx = (next.scripts ?? []).findIndex((s) => s.ideaId === id);
    if (idx >= 0)
      next.scripts[idx] = { ...next.scripts[idx], hooks: prevScript.hooks, cta: prevScript.cta };
    else (next.scripts ??= []).push(prevScript);
  }
  return next;
}

export async function refreshBank(
  project: ContentProjectRow,
  config: ProjectConfig,
): Promise<string> {
  const bank = await loadBank(project);
  const { prompt, frozenIds } = await buildPrompt(project, config, bank);

  let lastErrors: string[] = [];
  for (let attempt = 1; attempt <= 2; attempt++) {
    const extra = lastErrors.length
      ? `\n\nYOUR PREVIOUS ATTEMPT FAILED VALIDATION. Fix ALL of these and return the full corrected JSON:\n${lastErrors.map((e) => `- ${e}`).join("\n")}`
      : "";
    let next: Bank;
    try {
      next = enforceFrozen(parseBank(await callClaude(prompt + extra)), bank, frozenIds);
    } catch (e) {
      console.error(`[content:refresh] attempt ${attempt}: ${(e as Error).message}`);
      continue;
    }
    const { ok, errors } = validateBank(next);
    if (!ok) {
      console.error(`[content:refresh] attempt ${attempt}: ${errors.length} validation errors`);
      lastErrors = errors;
      continue;
    }
    const version = (bank.version ?? 1) + 1;
    const creative = (next.creative ?? {}) as Record<string, unknown>;
    await convex.mutation(api.content.applyBank, {
      projectId: project.projectId,
      ideas: (next.ideas ?? []).map((i) => ({
        ideaId: i.id,
        title: i.title,
        enemy: i.enemy,
        retired: Boolean(i.retired),
        data: JSON.stringify(i),
        creative: creative[i.id] ? JSON.stringify(creative[i.id]) : undefined,
      })),
      scripts: (next.scripts ?? []).map((s) => ({ ideaId: s.ideaId, data: JSON.stringify(s) })),
      dmPlaybook: next.dmPlaybook ? JSON.stringify(next.dmPlaybook) : undefined,
      bankVersion: version,
      bankRefreshedAt: Date.now(),
    });
    const prevActive = new Set(bank.ideas.filter((i) => !i.retired).map((i) => i.id));
    const nowActive = new Set((next.ideas ?? []).filter((i) => !i.retired).map((i) => i.id));
    const added = [...nowActive].filter((id) => !prevActive.has(id));
    const retired = [...prevActive].filter((id) => !nowActive.has(id));
    return `bank v${version}: +${added.length} ideas, ${retired.length} retired`;
  }
  throw new Error("refresh failed after 2 attempts — existing bank kept");
}
