import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Content desk queries + mutations (fork-local addition, see CONTENT.md).
// Ports the behavior of content-agent's scripts/db.js content functions:
// planned slots are immutable once posted, and marking a slot posted also
// writes the content log row that drives idea cooldowns.

const SCAN_LIMIT = 5000;

// ---------------------------------------------------------------- projects

export const listProjects = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("contentProjects").collect();
  },
});

export const upsertProject = mutation({
  args: {
    projectId: v.string(),
    name: v.string(),
    config: v.string(),
    dmPlaybook: v.optional(v.string()),
    bankVersion: v.optional(v.number()),
    bankRefreshedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("contentProjects")
      .withIndex("by_project_id", (q) => q.eq("projectId", args.projectId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { ...args, updatedAt: Date.now() });
      return existing._id;
    }
    return await ctx.db.insert("contentProjects", {
      ...args,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

// ------------------------------------------------------------------- ideas

export const listIdeas = query({
  args: { projectId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("contentIdeas")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
  },
});

export const upsertIdea = mutation({
  args: {
    projectId: v.string(),
    ideaId: v.string(),
    title: v.string(),
    enemy: v.string(),
    retired: v.boolean(),
    data: v.string(),
    creative: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("contentIdeas")
      .withIndex("by_project_idea", (q) =>
        q.eq("projectId", args.projectId).eq("ideaId", args.ideaId),
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { ...args, updatedAt: Date.now() });
      return existing._id;
    }
    return await ctx.db.insert("contentIdeas", {
      ...args,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

// ----------------------------------------------------------------- scripts

export const listScripts = query({
  args: { projectId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("contentScripts")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
  },
});

export const upsertScript = mutation({
  args: {
    projectId: v.string(),
    ideaId: v.string(),
    data: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("contentScripts")
      .withIndex("by_project_idea", (q) =>
        q.eq("projectId", args.projectId).eq("ideaId", args.ideaId),
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { ...args, updatedAt: Date.now() });
      return existing._id;
    }
    return await ctx.db.insert("contentScripts", { ...args, updatedAt: Date.now() });
  },
});

// ------------------------------------------------------------------- slots

export const listSlots = query({
  args: {
    projectId: v.string(),
    from: v.string(), // YYYY-MM-DD inclusive
    to: v.string(), // YYYY-MM-DD inclusive
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("contentSlots")
      .withIndex("by_project_date", (q) =>
        q.eq("projectId", args.projectId).gte("slotDate", args.from).lte("slotDate", args.to),
      )
      .collect();
  },
});

export const recentSlots = query({
  args: { projectId: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("contentSlots")
      .withIndex("by_project_date", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .take(args.limit ?? 100);
  },
});

// Upsert a planner/imported slot. A slot already marked posted is immutable
// history and is never overwritten (same rule as the old SQLite store).
export const upsertSlot = mutation({
  args: {
    projectId: v.string(),
    slotDate: v.string(),
    slotTime: v.string(),
    ideaId: v.string(),
    title: v.optional(v.string()),
    enemy: v.optional(v.string()),
    format: v.optional(v.string()),
    scripted: v.boolean(),
    plannedAt: v.number(),
    postedAt: v.optional(v.number()),
    postedVia: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const slotKey = `${args.projectId}:${args.slotDate}:${args.slotTime}`;
    const existing = await ctx.db
      .query("contentSlots")
      .withIndex("by_slot_key", (q) => q.eq("slotKey", slotKey))
      .unique();
    if (existing) {
      if (existing.postedAt) return existing._id; // immutable once posted
      await ctx.db.patch(existing._id, { ...args, slotKey });
      return existing._id;
    }
    return await ctx.db.insert("contentSlots", { ...args, slotKey });
  },
});

// Mark one slot posted on one platform: stamps the slot AND writes the
// content log row (which drives the planner's cooldown). Idempotent — a
// slot that is already posted is returned unchanged.
export const markSlotPosted = mutation({
  args: { slotKey: v.string(), platform: v.string() },
  handler: async (ctx, args) => {
    const slot = await ctx.db
      .query("contentSlots")
      .withIndex("by_slot_key", (q) => q.eq("slotKey", args.slotKey))
      .unique();
    if (!slot) return null;
    if (slot.postedAt) return slot._id;
    const now = Date.now();
    await ctx.db.patch(slot._id, { postedAt: now, postedVia: args.platform });
    await ctx.db.insert("contentLog", {
      projectId: slot.projectId,
      ideaId: slot.ideaId,
      format: slot.format,
      platform: args.platform,
      source: "manual",
      postedAt: now,
    });
    return slot._id;
  },
});

export const backlogStats = query({
  args: { projectId: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("contentSlots")
      .withIndex("by_project_date", (q) => q.eq("projectId", args.projectId))
      .take(SCAN_LIMIT);
    const planned = rows.length;
    const posted = rows.filter((s) => s.postedAt).length;
    return { planned, posted, backlog: planned - posted };
  },
});

// --------------------------------------------------------------------- log

export const addLog = mutation({
  args: {
    projectId: v.string(),
    ideaId: v.string(),
    format: v.optional(v.string()),
    platform: v.string(),
    shortcode: v.optional(v.string()),
    source: v.union(v.literal("auto"), v.literal("manual"), v.literal("import")),
    postedAt: v.number(),
  },
  handler: async (ctx, args) => {
    // Dedup on (shortcode) for auto/import rows so re-running the importer
    // or the Instagram matcher never double-logs a post.
    if (args.shortcode) {
      const existing = await ctx.db
        .query("contentLog")
        .withIndex("by_shortcode", (q) => q.eq("shortcode", args.shortcode))
        .first();
      if (existing) return existing._id;
    }
    // Shortcode-less rows dedup on exact (idea, postedAt) so re-running the
    // importer never duplicates manual entries.
    const dupe = await ctx.db
      .query("contentLog")
      .withIndex("by_project_idea", (q) =>
        q.eq("projectId", args.projectId).eq("ideaId", args.ideaId),
      )
      .filter((q) => q.eq(q.field("postedAt"), args.postedAt))
      .first();
    if (dupe) return dupe._id;
    return await ctx.db.insert("contentLog", args);
  },
});

export const recentLog = query({
  args: { projectId: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("contentLog")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .take(args.limit ?? 50);
    return rows;
  },
});

// ----------------------------------------------------- pull data (phase 2)

export const upsertPost = mutation({
  args: {
    projectId: v.string(),
    shortcode: v.string(),
    ownerHandle: v.string(),
    url: v.optional(v.string()),
    type: v.optional(v.string()),
    caption: v.optional(v.string()),
    hashtags: v.optional(v.string()),
    likes: v.number(),
    comments: v.number(),
    views: v.optional(v.number()),
    score: v.number(),
    postedAt: v.optional(v.number()),
    displayUrl: v.optional(v.string()),
    fetchedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("contentPosts")
      .withIndex("by_project_shortcode", (q) =>
        q.eq("projectId", args.projectId).eq("shortcode", args.shortcode),
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, args);
      return existing._id;
    }
    return await ctx.db.insert("contentPosts", args);
  },
});

export const upsertProfile = mutation({
  args: {
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
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("contentProfileSnapshots", {
      projectId: args.projectId,
      handle: args.handle,
      followers: args.followers,
      following: args.following,
      postsCount: args.postsCount,
      fetchedAt: args.fetchedAt,
    });
    const existing = await ctx.db
      .query("contentProfiles")
      .withIndex("by_project_handle", (q) =>
        q.eq("projectId", args.projectId).eq("handle", args.handle),
      )
      .unique();
    if (existing) {
      // Keep the old profile pic when a fallback pull has none.
      await ctx.db.patch(existing._id, {
        ...args,
        profilePicUrl: args.profilePicUrl ?? existing.profilePicUrl,
      });
      return existing._id;
    }
    return await ctx.db.insert("contentProfiles", args);
  },
});

export const logPull = mutation({
  args: {
    projectId: v.string(),
    kind: v.union(v.literal("profile"), v.literal("posts")),
    handle: v.string(),
    status: v.union(v.literal("ok"), v.literal("fallback"), v.literal("blocked")),
    items: v.number(),
    fetchedAt: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("contentPulls", args);
  },
});

// Freshness for one handle+kind: last success and last attempt of any status.
// A 'fallback' counts as success for profiles but not for posts — same rule
// as the old desk.
export const pullFreshness = query({
  args: {
    projectId: v.string(),
    kind: v.union(v.literal("profile"), v.literal("posts")),
    handle: v.string(),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("contentPulls")
      .withIndex("by_project_kind_handle", (q) =>
        q.eq("projectId", args.projectId).eq("kind", args.kind).eq("handle", args.handle),
      )
      .take(SCAN_LIMIT);
    const okStatuses = args.kind === "profile" ? ["ok", "fallback"] : ["ok"];
    let lastSuccess: number | null = null;
    let lastAttempt: number | null = null;
    for (const r of rows) {
      if (lastAttempt === null || r.fetchedAt > lastAttempt) lastAttempt = r.fetchedAt;
      if (okStatuses.includes(r.status) && (lastSuccess === null || r.fetchedAt > lastSuccess)) {
        lastSuccess = r.fetchedAt;
      }
    }
    return { lastSuccess, lastAttempt };
  },
});

export const listPosts = query({
  args: { projectId: v.string(), ownerHandle: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("contentPosts")
      .withIndex("by_project_owner", (q) =>
        q.eq("projectId", args.projectId).eq("ownerHandle", args.ownerHandle),
      )
      .take(SCAN_LIMIT);
    return rows.sort((a, b) => b.score - a.score);
  },
});

export const getProfile = query({
  args: { projectId: v.string(), handle: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("contentProfiles")
      .withIndex("by_project_handle", (q) =>
        q.eq("projectId", args.projectId).eq("handle", args.handle),
      )
      .unique();
  },
});

export const logShortcodes = query({
  args: { projectId: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("contentLog")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .take(SCAN_LIMIT);
    return rows.map((r) => r.shortcode).filter((s): s is string => Boolean(s));
  },
});

// Auto-detected Instagram publish → stamp the oldest unposted slot for the
// idea, preferring a slot with the matching format (old stampOldestSlot).
export const stampOldestSlot = mutation({
  args: {
    projectId: v.string(),
    ideaId: v.string(),
    format: v.optional(v.string()),
    postedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("contentSlots")
      .withIndex("by_project_date", (q) => q.eq("projectId", args.projectId))
      .take(SCAN_LIMIT);
    const candidates = rows
      .filter((s) => s.ideaId === args.ideaId && !s.postedAt)
      .sort(
        (a, b) =>
          Number(b.format === args.format) - Number(a.format === args.format) ||
          a.slotDate.localeCompare(b.slotDate),
      );
    const target = candidates[0];
    if (!target) return null;
    await ctx.db.patch(target._id, { postedAt: args.postedAt, postedVia: "instagram-auto" });
    return target._id;
  },
});

// ------------------------------------------------- bank refresh (phase 2)

// Apply a validated bank in one atomic mutation: upsert every idea and
// script, update project bank metadata. Ideas absent from the new bank are
// left untouched (the doctrine retires ideas, never deletes them).
export const applyBank = mutation({
  args: {
    projectId: v.string(),
    ideas: v.array(
      v.object({
        ideaId: v.string(),
        title: v.string(),
        enemy: v.string(),
        retired: v.boolean(),
        data: v.string(),
        creative: v.optional(v.string()),
      }),
    ),
    scripts: v.array(v.object({ ideaId: v.string(), data: v.string() })),
    dmPlaybook: v.optional(v.string()),
    bankVersion: v.number(),
    bankRefreshedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const idea of args.ideas) {
      const existing = await ctx.db
        .query("contentIdeas")
        .withIndex("by_project_idea", (q) =>
          q.eq("projectId", args.projectId).eq("ideaId", idea.ideaId),
        )
        .unique();
      if (existing) await ctx.db.patch(existing._id, { ...idea, updatedAt: now });
      else {
        await ctx.db.insert("contentIdeas", {
          ...idea,
          projectId: args.projectId,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
    for (const script of args.scripts) {
      const existing = await ctx.db
        .query("contentScripts")
        .withIndex("by_project_idea", (q) =>
          q.eq("projectId", args.projectId).eq("ideaId", script.ideaId),
        )
        .unique();
      if (existing) await ctx.db.patch(existing._id, { data: script.data, updatedAt: now });
      else {
        await ctx.db.insert("contentScripts", {
          ...script,
          projectId: args.projectId,
          updatedAt: now,
        });
      }
    }
    const project = await ctx.db
      .query("contentProjects")
      .withIndex("by_project_id", (q) => q.eq("projectId", args.projectId))
      .unique();
    if (project) {
      await ctx.db.patch(project._id, {
        dmPlaybook: args.dmPlaybook ?? project.dmPlaybook,
        bankVersion: args.bankVersion,
        bankRefreshedAt: args.bankRefreshedAt,
        updatedAt: now,
      });
    }
    return { ideas: args.ideas.length, scripts: args.scripts.length };
  },
});

// -------------------------------------------------- engine runs (phase 2)

export const createContentRun = mutation({
  args: {
    runId: v.string(),
    projectId: v.string(),
    trigger: v.union(v.literal("schedule"), v.literal("manual")),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("contentRuns", {
      ...args,
      status: "running",
      startedAt: Date.now(),
    });
  },
});

export const updateContentRun = mutation({
  args: {
    runId: v.string(),
    status: v.union(v.literal("running"), v.literal("completed"), v.literal("failed")),
    steps: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db
      .query("contentRuns")
      .withIndex("by_run_id", (q) => q.eq("runId", args.runId))
      .unique();
    if (!run) return null;
    const { runId: _runId, ...patch } = args;
    await ctx.db.patch(run._id, {
      ...patch,
      ...(args.status !== "running" ? { completedAt: Date.now() } : {}),
    });
    return run._id;
  },
});

export const recentContentRuns = query({
  args: { projectId: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("contentRuns")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .take(args.limit ?? 10);
  },
});

// Per-idea usage summary: times used, last posted, per-format lasts.
// Same shape as the old getContentUsage() so the planner port (phase 2)
// can consume it unchanged.
export const ideaUsage = query({
  args: { projectId: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("contentLog")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .take(SCAN_LIMIT);
    const usage: Record<
      string,
      { timesUsed: number; lastPostedAt: number; formats: Record<string, number> }
    > = {};
    // rows are newest-first, so the first sighting of an idea/format is its latest.
    for (const r of rows) {
      const u = (usage[r.ideaId] ??= { timesUsed: 0, lastPostedAt: r.postedAt, formats: {} });
      u.timesUsed++;
      if (r.format && !(r.format in u.formats)) u.formats[r.format] = r.postedAt;
    }
    return usage;
  },
});
