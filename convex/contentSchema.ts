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

  // Reference clip library: screen recordings of the app (full walkthrough +
  // per-tab standalones) uploaded to Convex file storage. A UGC brief anchors
  // to one or more of these as its Seedance starting footage ([Video1]…).
  // `tag` groups them (full-walkthrough | list | receipt-scan | …) so any idea
  // can pull the right clip.
  contentClips: defineTable({
    projectId: v.string(),
    clipId: v.string(),
    label: v.string(),
    tag: v.string(),
    storageId: v.id("_storage"),
    durationSec: v.optional(v.number()),
    addedAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_project_clip", ["projectId", "clipId"]),

  // Viral reference: a niche video the user feeds in for teardown. It informs
  // the creative template (hook, structure, VO style) and is NEVER sent to
  // Seedance — the analysis drafts a UGC brief that anchors to an app clip.
  // `teardown` is the JSON analysis; a drafted brief links back via refId.
  viralReferences: defineTable({
    projectId: v.string(),
    refId: v.string(),
    platform: v.string(), // tiktok | instagram | youtube | other
    url: v.optional(v.string()),
    caption: v.optional(v.string()),
    notes: v.optional(v.string()), // the user's beat-by-beat "what happens"
    teardown: v.optional(v.string()), // JSON analysis result
    status: v.union(v.literal("new"), v.literal("done")),
    createdAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_project_ref", ["projectId", "refId"]),

  // Pinned avatars — a reusable cast. The ad generator suggests a fresh avatar
  // per brief; the user pins the good ones (keyed to a problem type) to reuse.
  // `prompt` is the GPT Image 2 prompt; `imageStorageId` an optional generated face.
  contentAvatars: defineTable({
    projectId: v.string(),
    avatarId: v.string(),
    label: v.string(),
    problemType: v.optional(v.string()),
    prompt: v.string(),
    imageStorageId: v.optional(v.id("_storage")),
    createdAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_project_avatar", ["projectId", "avatarId"]),

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

  // Every published execution — one row per (idea, platform). Drives idea
  // cooldowns. `url` is the live link to the posted video and `externalId` the
  // platform id parsed from it, so a future stats pull can walk these rows.
  contentLog: defineTable({
    projectId: v.string(),
    ideaId: v.string(),
    briefId: v.optional(v.string()), // which ugcBrief produced it
    format: v.optional(v.string()),
    platform: v.string(), // instagram | tiktok | facebook | youtube-shorts | all
    url: v.optional(v.string()), // link to the posted video
    externalId: v.optional(v.string()), // id/shortcode parsed from url
    shortcode: v.optional(v.string()), // legacy Instagram auto-match key
    source: v.union(v.literal("auto"), v.literal("manual"), v.literal("import")),
    postedAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_project_idea", ["projectId", "ideaId"])
    .index("by_shortcode", ["shortcode"]),

  // Time-series performance snapshots per posted link. Populated by a future
  // on-demand "refresh stats" action (not built yet) that walks contentLog
  // rows carrying a url. Kept as a separate table so high-churn metric writes
  // never contend with the immutable log rows.
  contentMetrics: defineTable({
    projectId: v.string(),
    logId: v.id("contentLog"),
    platform: v.string(),
    url: v.string(),
    views: v.optional(v.number()),
    likes: v.optional(v.number()),
    comments: v.optional(v.number()),
    shares: v.optional(v.number()),
    fetchedAt: v.number(),
  })
    .index("by_log", ["logId"])
    .index("by_project", ["projectId"]),

  // DEPRECATED (UGC rewrite, phase 3): the Apify scraper + weekly engine were
  // removed, so the five tables below (contentPosts, contentProfiles,
  // contentProfileSnapshots, contentPulls, contentRuns) no longer have any
  // reader or writer. Definitions are kept only so existing rows stay schema-
  // valid; drop them in a dedicated cleanup once the data is cleared.

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
