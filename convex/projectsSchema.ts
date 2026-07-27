import { defineTable } from "convex/server";
import { v } from "convex/values";

// Project registry (fork-local addition, see FORK.md).
// Gives Boop durable, up-to-date awareness of the user's software projects
// (Twizzle, Sigil, …): what they are, their offerings, where they are in the
// dev cycle, whether they're live, and recently shipped work — so when the
// user names a project the agent already knows it.
//
// Kept in a separate file (like contentSchema.ts) so upstream merges into
// schema.ts stay trivial: one import + one spread.
//
// Freshness is HYBRID. A Mac-side repo-sync job (scripts/project-sync.ts)
// fills the sync-owned fields from git / README / a live-URL health check;
// anything the user edits in chat or the UI is marked "manual" in
// `fieldSources` and is never overwritten by sync. See server/projects/sync.ts.
export const stageV = v.union(
  v.literal("idea"),
  v.literal("building"),
  v.literal("beta"),
  v.literal("live"),
  v.literal("paused"),
);

// One shipped/done item. `recentTasks` is additive (merged + deduped, newest
// first) rather than field-owned, so git-derived tasks and manual notes
// coexist instead of clobbering each other.
export const recentTaskV = v.object({
  summary: v.string(),
  at: v.number(),
});

export const projectTables = {
  projects: defineTable({
    projectId: v.string(),
    name: v.string(),
    // Recognition surface: every name the user might say for this project,
    // stored lowercased. Always includes the canonical name + projectId.
    aliases: v.array(v.string()),
    summary: v.string(), // one-liner: what it is
    offerings: v.array(v.string()),
    stage: stageV,
    live: v.boolean(),
    liveUrl: v.optional(v.string()),
    repoPath: v.optional(v.string()), // absolute path on the Mac, for repo-sync
    recentTasks: v.array(recentTaskV),
    version: v.optional(v.string()),
    branch: v.optional(v.string()),
    notes: v.optional(v.string()),
    // Per-field ownership map (JSON: { [field]: "manual" | "auto" }). Fields
    // marked "manual" are user-authoritative and repo-sync leaves them alone.
    fieldSources: v.optional(v.string()),
    healthCheckedAt: v.optional(v.number()),
    lastSyncedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_project_id", ["projectId"])
    .index("by_stage", ["stage"]),
};
