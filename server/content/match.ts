// Instagram auto-matching — port of the content-log matcher from
// content-agent's run-agents.js. Published IG captions are matched against
// the hooks/CTAs the desk wrote; hits are logged (driving cooldowns) and
// stamp the oldest unposted slot for that idea.

import { convex } from "../convex-client.js";
import { api } from "../../convex/_generated/api.js";
import { norm, type BankScript, type ProjectConfig } from "./types.js";

export async function autoMatch(projectId: string, config: ProjectConfig): Promise<string> {
  const scripts = (await convex.query(api.content.listScripts, { projectId })) as {
    ideaId: string;
    data: string;
  }[];
  const parsed: BankScript[] = scripts.map((s) => JSON.parse(s.data));
  const matchable = parsed
    .flatMap((s) =>
      [...(s.hooks ?? []), s.cta].map((text) => ({
        ideaId: s.ideaId,
        text: norm(text).slice(0, 60),
      })),
    )
    .filter((m) => m.text.length > 20);

  const posts = (await convex.query(api.content.listPosts, {
    projectId,
    ownerHandle: config.instagramHandle.toLowerCase(),
  })) as { shortcode: string; caption?: string; type?: string; postedAt?: number }[];
  const logged = new Set(await convex.query(api.content.logShortcodes, { projectId }));

  let matched = 0;
  for (const post of posts) {
    if (!post.shortcode || logged.has(post.shortcode)) continue;
    const cap = norm(post.caption);
    const hit = matchable.find((m) => cap.includes(m.text));
    if (!hit) continue;
    const format =
      post.type === "Video" ? "reel" : post.type === "Sidecar" ? "carousel" : "image";
    const postedAt = post.postedAt ?? Date.now();
    await convex.mutation(api.content.addLog, {
      projectId,
      ideaId: hit.ideaId,
      format,
      platform: "instagram",
      shortcode: post.shortcode,
      source: "auto",
      postedAt,
    });
    await convex.mutation(api.content.stampOldestSlot, {
      projectId,
      ideaId: hit.ideaId,
      format,
      postedAt,
    });
    matched++;
  }
  return `${matched} new auto-matches`;
}
