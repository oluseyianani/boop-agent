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

// Delete an idea outright (used to dismiss generated ideas from the bank).
// Also clears its scripts so no orphan script rows linger.
export const deleteIdea = mutation({
  args: { projectId: v.string(), ideaId: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("contentIdeas")
      .withIndex("by_project_idea", (q) =>
        q.eq("projectId", args.projectId).eq("ideaId", args.ideaId),
      )
      .unique();
    if (!existing) return null;
    const scripts = await ctx.db
      .query("contentScripts")
      .withIndex("by_project_idea", (q) =>
        q.eq("projectId", args.projectId).eq("ideaId", args.ideaId),
      )
      .collect();
    for (const s of scripts) await ctx.db.delete(s._id);
    await ctx.db.delete(existing._id);
    return existing._id;
  },
});

// Patch only the creative pack of an idea (the UGC briefs live here as a JSON
// blob). Used by the brief composer — keeps the rest of the idea untouched.
export const setIdeaCreative = mutation({
  args: { projectId: v.string(), ideaId: v.string(), creative: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("contentIdeas")
      .withIndex("by_project_idea", (q) =>
        q.eq("projectId", args.projectId).eq("ideaId", args.ideaId),
      )
      .unique();
    if (!existing) return null;
    await ctx.db.patch(existing._id, { creative: args.creative, updatedAt: Date.now() });
    return existing._id;
  },
});

// ------------------------------------------------------- reference clips

// A short-lived signed URL the browser POSTs the recording to. The client
// then calls registerClip with the returned storageId.
export const generateClipUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const registerClip = mutation({
  args: {
    projectId: v.string(),
    clipId: v.string(),
    label: v.string(),
    tag: v.string(),
    storageId: v.id("_storage"),
    durationSec: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("contentClips")
      .withIndex("by_project_clip", (q) =>
        q.eq("projectId", args.projectId).eq("clipId", args.clipId),
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { label: args.label, tag: args.tag });
      return existing._id;
    }
    return await ctx.db.insert("contentClips", { ...args, addedAt: Date.now() });
  },
});

// Clips for a project, newest first, each with a resolved signed playback URL.
export const listClips = query({
  args: { projectId: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("contentClips")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .take(200);
    return await Promise.all(
      rows.map(async (r) => ({
        clipId: r.clipId,
        label: r.label,
        tag: r.tag,
        durationSec: r.durationSec,
        addedAt: r.addedAt,
        url: await ctx.storage.getUrl(r.storageId),
      })),
    );
  },
});

export const deleteClip = mutation({
  args: { projectId: v.string(), clipId: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("contentClips")
      .withIndex("by_project_clip", (q) =>
        q.eq("projectId", args.projectId).eq("clipId", args.clipId),
      )
      .unique();
    if (!row) return null;
    await ctx.storage.delete(row.storageId);
    await ctx.db.delete(row._id);
    return row._id;
  },
});

// -------------------------------------------------- pinned avatars

export const listAvatars = query({
  args: { projectId: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("contentAvatars")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .take(100);
    return await Promise.all(
      rows.map(async (r) => ({
        avatarId: r.avatarId,
        label: r.label,
        problemType: r.problemType,
        prompt: r.prompt,
        imageUrl: r.imageStorageId ? await ctx.storage.getUrl(r.imageStorageId) : null,
        createdAt: r.createdAt,
      })),
    );
  },
});

export const saveAvatar = mutation({
  args: {
    projectId: v.string(),
    avatarId: v.string(),
    label: v.string(),
    problemType: v.optional(v.string()),
    prompt: v.string(),
    imageStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("contentAvatars")
      .withIndex("by_project_avatar", (q) =>
        q.eq("projectId", args.projectId).eq("avatarId", args.avatarId),
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, args);
      return existing._id;
    }
    return await ctx.db.insert("contentAvatars", { ...args, createdAt: Date.now() });
  },
});

export const deleteAvatar = mutation({
  args: { projectId: v.string(), avatarId: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("contentAvatars")
      .withIndex("by_project_avatar", (q) =>
        q.eq("projectId", args.projectId).eq("avatarId", args.avatarId),
      )
      .unique();
    if (!row) return null;
    if (row.imageStorageId) await ctx.storage.delete(row.imageStorageId);
    await ctx.db.delete(row._id);
    return row._id;
  },
});

// -------------------------------------------------- viral references

export const listViralReferences = query({
  args: { projectId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("viralReferences")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .take(100);
  },
});

export const saveViralReference = mutation({
  args: {
    projectId: v.string(),
    refId: v.string(),
    platform: v.string(),
    url: v.optional(v.string()),
    caption: v.optional(v.string()),
    notes: v.optional(v.string()),
    teardown: v.optional(v.string()),
    status: v.union(v.literal("new"), v.literal("done")),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("viralReferences")
      .withIndex("by_project_ref", (q) =>
        q.eq("projectId", args.projectId).eq("refId", args.refId),
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, args);
      return existing._id;
    }
    return await ctx.db.insert("viralReferences", { ...args, createdAt: Date.now() });
  },
});

export const deleteViralReference = mutation({
  args: { projectId: v.string(), refId: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("viralReferences")
      .withIndex("by_project_ref", (q) =>
        q.eq("projectId", args.projectId).eq("refId", args.refId),
      )
      .unique();
    if (!row) return null;
    await ctx.db.delete(row._id);
    return row._id;
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

// Parse the platform-native id from a posted URL so a future stats pull can
// address it. Best-effort — returns undefined for shortlinks we can't resolve.
function parseExternalId(url: string): string | undefined {
  try {
    const u = new URL(url.trim());
    const path = u.pathname;
    let m: RegExpMatchArray | null;
    if ((m = path.match(/\/video\/(\d+)/))) return m[1]; // tiktok
    if ((m = path.match(/\/(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/))) return m[1]; // instagram/fb
    if ((m = path.match(/\/shorts\/([A-Za-z0-9_-]+)/))) return m[1]; // youtube shorts
    if (u.hostname.includes("youtu.be") && path.length > 1) return path.slice(1);
    const vid = u.searchParams.get("v");
    if (vid) return vid; // youtube watch
    return undefined;
  } catch {
    return undefined;
  }
}

// Mark ANY idea posted, capturing a link per platform (the modal in the desk).
// Writes one contentLog row per platform (dedup on idea+platform+url) and, if a
// slotKey is given, stamps that calendar slot too. Drives idea cooldowns.
export const markIdeaPosted = mutation({
  args: {
    projectId: v.string(),
    ideaId: v.string(),
    format: v.optional(v.string()),
    briefId: v.optional(v.string()),
    slotKey: v.optional(v.string()),
    posts: v.array(
      v.object({
        platform: v.string(),
        url: v.string(),
        postedAt: v.optional(v.number()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("contentLog")
      .withIndex("by_project_idea", (q) =>
        q.eq("projectId", args.projectId).eq("ideaId", args.ideaId),
      )
      .take(SCAN_LIMIT);
    let written = 0;
    for (const post of args.posts) {
      const url = post.url.trim();
      // Dedup only when we have a link (the text path may mark without one).
      if (url && existing.some((r) => r.platform === post.platform && r.url === url)) continue;
      await ctx.db.insert("contentLog", {
        projectId: args.projectId,
        ideaId: args.ideaId,
        briefId: args.briefId,
        format: args.format,
        platform: post.platform,
        url: url || undefined,
        externalId: url ? parseExternalId(url) : undefined,
        source: "manual",
        postedAt: post.postedAt ?? now,
      });
      written++;
    }
    if (args.slotKey) {
      const slot = await ctx.db
        .query("contentSlots")
        .withIndex("by_slot_key", (q) => q.eq("slotKey", args.slotKey!))
        .unique();
      if (slot && !slot.postedAt) {
        await ctx.db.patch(slot._id, {
          postedAt: args.posts[0]?.postedAt ?? now,
          postedVia: args.posts.map((p) => p.platform).join(", ") || undefined,
        });
      }
    }
    return { written };
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

// Per-idea usage summary: times used, last posted, per-format lasts. Drives
// the idea-bank cooldown state in the desk and the dispatcher tools.
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
