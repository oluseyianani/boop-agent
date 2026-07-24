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
