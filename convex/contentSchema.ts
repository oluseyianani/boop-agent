import { defineTable } from "convex/server";
import { v } from "convex/values";

// Content desk tables (fork-local addition, see CONTENT.md).
// Kept in this separate file so upstream merges into schema.ts stay trivial:
// the only upstream touch is one import + one spread.
//
// Convention notes (matching the upstream schema):
// - string business IDs with a by_x_id index, Convex _id stays internal
// - timestamps are Date.now() ms numbers
// - loose/evolving structures are JSON blobs in v.string() fields
export const contentTables = {
  // One row per content project (e.g. "twizle"). `config` mirrors the old
  // content-agent project.json (handles, platforms, conceptsPerDay,
  // ideaCooldownDays, accentColor…) so nothing is lost in migration.
  contentProjects: defineTable({
    projectId: v.string(),
    name: v.string(),
    config: v.string(),
    // DM playbook entries from the content bank (JSON array).
    dmPlaybook: v.optional(v.string()),
    bankVersion: v.optional(v.number()),
    bankRefreshedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_project_id", ["projectId"]),

  // The idea bank. Every idea names its enemy and failure moment (doctrine).
  // `data` is the full idea object (angle, failureMoment, formats, keywords…);
  // `creative` is the Creative Director pack for the idea when one exists.
  contentIdeas: defineTable({
    projectId: v.string(),
    ideaId: v.string(),
    title: v.string(),
    enemy: v.string(),
    retired: v.boolean(),
    data: v.string(),
    creative: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_project_idea", ["projectId", "ideaId"]),

  // Hook & Script output per idea: { hooks, beats, cta, ugcBrief } as JSON.
  contentScripts: defineTable({
    projectId: v.string(),
    ideaId: v.string(),
    data: v.string(),
    updatedAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_project_idea", ["projectId", "ideaId"]),

  // Planner calendar. A slot already marked posted is immutable history —
  // re-planning only ever updates unposted slots (enforced in content.ts).
  contentSlots: defineTable({
    slotKey: v.string(), // `${projectId}:${slotDate}:${slotTime}`
    projectId: v.string(),
    slotDate: v.string(), // YYYY-MM-DD
    slotTime: v.string(), // HH:MM
    ideaId: v.string(),
    title: v.optional(v.string()),
    enemy: v.optional(v.string()),
    format: v.optional(v.string()),
    scripted: v.boolean(),
    plannedAt: v.number(),
    postedAt: v.optional(v.number()),
    postedVia: v.optional(v.string()),
  })
    .index("by_slot_key", ["slotKey"])
    .index("by_project_date", ["projectId", "slotDate"]),

  // Every published execution. Drives the planner's least-recently-used
  // rotation and idea cooldowns. `shortcode` links Instagram auto-matches.
  contentLog: defineTable({
    projectId: v.string(),
    ideaId: v.string(),
    format: v.optional(v.string()),
    platform: v.string(), // instagram | tiktok | facebook | youtube-shorts | all
    shortcode: v.optional(v.string()),
    source: v.union(v.literal("auto"), v.literal("manual"), v.literal("import")),
    postedAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_project_idea", ["projectId", "ideaId"])
    .index("by_shortcode", ["shortcode"]),

  // Scraped Instagram posts (own + competitors). Score = views for video,
  // likes+comments otherwise — same ranking the old desk used.
  contentPosts: defineTable({
    projectId: v.string(),
    shortcode: v.string(),
    ownerHandle: v.string(),
    url: v.optional(v.string()),
    type: v.optional(v.string()),
    caption: v.optional(v.string()),
    hashtags: v.optional(v.string()), // JSON array
    likes: v.number(),
    comments: v.number(),
    views: v.optional(v.number()),
    score: v.number(),
    postedAt: v.optional(v.number()),
    displayUrl: v.optional(v.string()),
    fetchedAt: v.number(),
  })
    .index("by_project_owner", ["projectId", "ownerHandle"])
    .index("by_project_shortcode", ["projectId", "shortcode"]),

  // Current profile state per handle; snapshots feed follower-growth charts.
  contentProfiles: defineTable({
    projectId: v.string(),
    handle: v.string(),
    username: v.optional(v.string()),
    fullName: v.optional(v.string()),
    followers: v.optional(v.number()),
    following: v.optional(v.number()),
    postsCount: v.optional(v.number()),
    biography: v.optional(v.string()),
    profilePicUrl: v.optional(v.string()),
    source: v.optional(v.string()),
    fetchedAt: v.number(),
  }).index("by_project_handle", ["projectId", "handle"]),

  contentProfileSnapshots: defineTable({
    projectId: v.string(),
    handle: v.string(),
    followers: v.optional(v.number()),
    following: v.optional(v.number()),
    postsCount: v.optional(v.number()),
    fetchedAt: v.number(),
  }).index("by_project_handle", ["projectId", "handle"]),

  // Every pull attempt (ok | fallback | blocked) — drives freshness TTLs
  // and blocked-handle cooldowns exactly like the old pulls table.
  contentPulls: defineTable({
    projectId: v.string(),
    kind: v.union(v.literal("profile"), v.literal("posts")),
    handle: v.string(),
    status: v.union(v.literal("ok"), v.literal("fallback"), v.literal("blocked")),
    items: v.number(),
    fetchedAt: v.number(),
  }).index("by_project_kind_handle", ["projectId", "kind", "handle"]),

  // One row per weekly-engine run (manual or scheduled) for the Content tab.
  contentRuns: defineTable({
    runId: v.string(),
    projectId: v.string(),
    trigger: v.union(v.literal("schedule"), v.literal("manual")),
    status: v.union(v.literal("running"), v.literal("completed"), v.literal("failed")),
    steps: v.optional(v.string()), // JSON: [{step, ok, detail}]
    error: v.optional(v.string()),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_run_id", ["runId"])
    .index("by_project", ["projectId"]),
};
