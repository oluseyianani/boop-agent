import { mutation, query } from "./_generated/server.js";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { recentTaskV, stageV } from "./projectsSchema";

// Fields whose ownership is tracked in `fieldSources`. `recentTasks` is
// deliberately excluded — it's additive (see below), not owned.
const TRACKED_FIELDS = [
  "name",
  "aliases",
  "summary",
  "offerings",
  "stage",
  "live",
  "liveUrl",
  "repoPath",
  "version",
  "branch",
  "notes",
] as const;

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "project"
  );
}

// Canonical + user aliases, lowercased and de-duped. Always resolvable by the
// project's own name and id.
function normAliases(name: string, projectId: string, aliases?: string[]): string[] {
  const set = new Set<string>();
  for (const a of [name, projectId, ...(aliases ?? [])]) {
    const t = a.toLowerCase().trim();
    if (t) set.add(t);
  }
  return [...set];
}

function mergeTasks(
  incoming: { summary: string; at: number }[] | undefined,
  existing: { summary: string; at: number }[] | undefined,
): { summary: string; at: number }[] {
  const seen = new Set<string>();
  const out: { summary: string; at: number }[] = [];
  for (const t of [...(incoming ?? []), ...(existing ?? [])]) {
    const key = t.summary.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out.sort((a, b) => b.at - a.at).slice(0, 20);
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("projects").order("desc").take(200);
  },
});

export const get = query({
  args: { projectId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("projects")
      .withIndex("by_project_id", (q) => q.eq("projectId", args.projectId))
      .unique();
  },
});

// Case-insensitive lookup by projectId, canonical name, or any alias. Used by
// the agent's get_project tool when the user names a project.
export const resolve = query({
  args: { nameOrAlias: v.string() },
  handler: async (ctx, args): Promise<Doc<"projects"> | null> => {
    const needle = args.nameOrAlias.toLowerCase().trim();
    if (!needle) return null;
    const all = await ctx.db.query("projects").take(200);
    return (
      all.find(
        (p) =>
          p.projectId.toLowerCase() === needle ||
          p.name.toLowerCase() === needle ||
          p.aliases.some((a) => a.toLowerCase() === needle),
      ) ?? null
    );
  },
});

// Compact recognition list injected into the dispatcher system prompt so Boop
// recognizes a project name without an explicit tool call.
export const roster = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("projects").order("desc").take(200);
    return all.map((p) => ({
      name: p.name,
      aliases: p.aliases,
      summary: p.summary,
      stage: p.stage,
      live: p.live,
      liveUrl: p.liveUrl ?? null,
    }));
  },
});

// Create-or-update with field-level ownership. `source: "manual"` (user edits
// from chat/UI) always wins and pins the field; `source: "auto"` (repo-sync)
// only writes fields not already pinned manual. `recentTasks` is merged
// additively regardless of source; healthCheckedAt / lastSyncedAt are metadata
// and always applied.
export const upsert = mutation({
  args: {
    projectId: v.optional(v.string()),
    source: v.optional(v.union(v.literal("manual"), v.literal("auto"))),
    name: v.optional(v.string()),
    aliases: v.optional(v.array(v.string())),
    summary: v.optional(v.string()),
    offerings: v.optional(v.array(v.string())),
    stage: v.optional(stageV),
    live: v.optional(v.boolean()),
    liveUrl: v.optional(v.union(v.string(), v.null())),
    repoPath: v.optional(v.union(v.string(), v.null())),
    recentTasks: v.optional(v.array(recentTaskV)),
    version: v.optional(v.union(v.string(), v.null())),
    branch: v.optional(v.union(v.string(), v.null())),
    notes: v.optional(v.union(v.string(), v.null())),
    healthCheckedAt: v.optional(v.number()),
    lastSyncedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const source = args.source ?? "manual";
    const projectId = args.projectId ?? slugify(args.name ?? "");
    if (!projectId || projectId === "project") {
      if (!args.name) throw new Error("upsert requires a name or projectId");
    }

    const existing = await ctx.db
      .query("projects")
      .withIndex("by_project_id", (q) => q.eq("projectId", projectId))
      .unique();

    const sources: Record<string, string> = existing?.fieldSources
      ? JSON.parse(existing.fieldSources)
      : {};

    // Coalesce v.null() (explicit clear) into undefined so the patch removes
    // the field, and leave truly-absent args untouched.
    const raw: Record<string, unknown> = {
      name: args.name,
      aliases: args.aliases,
      summary: args.summary,
      offerings: args.offerings,
      stage: args.stage,
      live: args.live,
      liveUrl: args.liveUrl,
      repoPath: args.repoPath,
      version: args.version,
      branch: args.branch,
      notes: args.notes,
    };

    const patch: Record<string, unknown> = {};
    for (const field of TRACKED_FIELDS) {
      if (!(field in raw)) continue;
      const value = raw[field];
      if (value === undefined) continue; // arg not supplied
      // Respect manual ownership: auto sync never overwrites a pinned field.
      if (source === "auto" && sources[field] === "manual") continue;
      patch[field] = value === null ? undefined : value;
      sources[field] = source;
    }

    // Recognition aliases follow the name; recompute whenever either changes.
    if (patch.name !== undefined || patch.aliases !== undefined) {
      patch.aliases = normAliases(
        (patch.name as string) ?? existing?.name ?? projectId,
        projectId,
        (patch.aliases as string[]) ?? existing?.aliases,
      );
    }

    if (args.recentTasks !== undefined) {
      patch.recentTasks = mergeTasks(args.recentTasks, existing?.recentTasks);
    }
    if (args.healthCheckedAt !== undefined) patch.healthCheckedAt = args.healthCheckedAt;
    if (args.lastSyncedAt !== undefined) patch.lastSyncedAt = args.lastSyncedAt;

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...patch,
        fieldSources: JSON.stringify(sources),
        updatedAt: now,
      });
      return projectId;
    }

    await ctx.db.insert("projects", {
      projectId,
      name: (patch.name as string) ?? args.name ?? projectId,
      aliases:
        (patch.aliases as string[]) ??
        normAliases(args.name ?? projectId, projectId, args.aliases),
      summary: (patch.summary as string) ?? "",
      offerings: (patch.offerings as string[]) ?? [],
      stage: (patch.stage as Doc<"projects">["stage"]) ?? "idea",
      live: (patch.live as boolean) ?? false,
      liveUrl: patch.liveUrl as string | undefined,
      repoPath: patch.repoPath as string | undefined,
      recentTasks: (patch.recentTasks as { summary: string; at: number }[]) ?? [],
      version: patch.version as string | undefined,
      branch: patch.branch as string | undefined,
      notes: patch.notes as string | undefined,
      fieldSources: JSON.stringify(sources),
      healthCheckedAt: args.healthCheckedAt,
      lastSyncedAt: args.lastSyncedAt,
      createdAt: now,
      updatedAt: now,
    });
    return projectId;
  },
});

export const remove = mutation({
  args: { projectId: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("projects")
      .withIndex("by_project_id", (q) => q.eq("projectId", args.projectId))
      .unique();
    if (!existing) return null;
    await ctx.db.delete(existing._id);
    return existing._id;
  },
});
