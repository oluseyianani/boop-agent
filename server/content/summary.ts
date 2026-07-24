// Weekly summary memory — one distilled fact per engine run written into
// Boop's memory (project segment, long tier), superseding last week's
// summary so the memory store keeps a single current narrative instead of
// accumulating stale follower counts. This is the ONLY bridge from the
// content engine into memory — raw pull rows deliberately stay in the
// structured content tables (see the evaluation in CONTENT.md).

import { convex } from "../convex-client.js";
import { api } from "../../convex/_generated/api.js";
import { embed } from "../embeddings.js";
import { makeMemoryId, SEGMENT_DEFAULTS } from "../memory/types.js";
import type { ContentProjectRow, ProjectConfig } from "./types.js";

export async function writeWeeklySummary(
  project: ContentProjectRow,
  config: ProjectConfig,
): Promise<string> {
  const projectId = project.projectId;
  const own = config.instagramHandle.toLowerCase();

  const history = (await convex.query(api.content.followerHistory, {
    projectId,
    handle: own,
  })) as { followers: number | null; at: number }[];
  const latest = history.at(-1);
  const previous = [...history].reverse().find(
    (h) => latest && h.at < latest.at && h.followers != null,
  );
  const delta =
    latest?.followers != null && previous?.followers != null
      ? latest.followers - previous.followers
      : null;

  const myPosts = (await convex.query(api.content.listPosts, {
    projectId,
    ownerHandle: own,
  })) as { type?: string; score: number }[];

  let topCompetitor = "";
  let best: { handle: string; score: number; caption: string } | null = null;
  for (const c of config.competitors ?? []) {
    const posts = (await convex.query(api.content.listPosts, {
      projectId,
      ownerHandle: c.handle.toLowerCase(),
    })) as { score: number; caption?: string }[];
    const top = posts[0];
    if (top && (!best || top.score > best.score)) {
      best = {
        handle: c.handle,
        score: top.score,
        caption: [...String(top.caption ?? "")].slice(0, 80).join("").replace(/\n/g, " "),
      };
    }
  }
  if (best) {
    topCompetitor = ` Strongest niche post this week: @${best.handle} (score ${best.score}) — "${best.caption}".`;
  }

  const date = new Date().toISOString().slice(0, 10);
  const content =
    `${project.name} content desk, week of ${date}: @${config.instagramHandle} at ` +
    `${latest?.followers ?? "unknown"} followers` +
    (delta != null ? ` (${delta >= 0 ? "+" + delta : delta} since the previous pull)` : "") +
    `. Top own post score ${myPosts[0]?.score ?? "n/a"} (${myPosts[0]?.type ?? "?"}). ` +
    `Content bank at v${project.bankVersion ?? 1}.` +
    topCompetitor;

  // Supersede last week's summary so consolidation never has to.
  const settingKey = `content_last_summary_${projectId}`;
  const previousMemoryId = (await convex.query(api.settings.get, {
    key: settingKey,
  })) as string | null;

  const memoryId = makeMemoryId();
  const defaults = SEGMENT_DEFAULTS.project;
  const embedding = (await embed(content)) ?? undefined;
  await convex.mutation(api.memoryRecords.upsert, {
    memoryId,
    content,
    tier: defaults.tier,
    segment: "project",
    importance: defaults.importance,
    decayRate: defaults.decayRate,
    embedding,
    supersedes: previousMemoryId ? [previousMemoryId] : undefined,
  });
  await convex.mutation(api.settings.set, { key: settingKey, value: memoryId });
  await convex.mutation(api.memoryEvents.emit, {
    eventType: "content.weekly_summary",
    data: JSON.stringify({ memoryId, projectId, supersedes: previousMemoryId }),
  });
  return `memory written (${latest?.followers ?? "?"} followers${delta != null ? `, ${delta >= 0 ? "+" : ""}${delta}` : ""})`;
}
