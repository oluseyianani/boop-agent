// Instagram pull via Apify — TypeScript port of content-agent's pull-data.js,
// writing to Convex instead of SQLite.
//
// Hard rule preserved: never use instagram-profile-scraper's latestPosts for
// top-post ranking — always resultsType "posts" with a high resultsLimit.

import { convex } from "../convex-client.js";
import { api } from "../../convex/_generated/api.js";
import type { ProjectConfig } from "./types.js";

const API = "https://api.apify.com/v2";
const ACTOR = "apify~instagram-scraper";
const profileUrl = (h: string) => `https://www.instagram.com/${h}/`;

type ApifyItem = Record<string, any>;

function token(): string {
  const t = process.env.APIFY_TOKEN;
  if (!t) throw new Error("APIFY_TOKEN is not set");
  return t;
}

// Token goes in the Authorization header only — never in URLs/logs.
async function apiCall(url: string, opts: RequestInit = {}): Promise<any> {
  const res = await fetch(url, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
      ...(opts.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `${res.status} ${res.statusText} for ${url.replace(API, "")}\n${body.slice(0, 500)}`,
    );
  }
  return res.json();
}

async function runActor(label: string, input: unknown): Promise<ApifyItem[]> {
  console.log(`[content:pull] [${label}] starting run…`);
  const { data: run } = await apiCall(`${API}/acts/${ACTOR}/runs`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  let status: string = run.status;
  const started = Date.now();
  while (status === "READY" || status === "RUNNING") {
    await new Promise((r) => setTimeout(r, 10_000));
    const { data } = await apiCall(`${API}/actor-runs/${run.id}`);
    status = data.status;
  }
  if (status !== "SUCCEEDED") throw new Error(`[${label}] run ended with status ${status}`);
  const items: ApifyItem[] = await apiCall(
    `${API}/datasets/${run.defaultDatasetId}/items?clean=true&format=json`,
  );
  console.log(
    `[content:pull] [${label}] done — ${items.length} items (${Math.round((Date.now() - started) / 1000)}s)`,
  );
  return items;
}

const isErrorItem = (it: ApifyItem) => Array.isArray(it.requestErrorMessages);

async function runWithRetry(
  label: string,
  handles: string[],
  inputFor: (hs: string[]) => unknown,
  attempts = 3,
): Promise<{ items: ApifyItem[]; blocked: string[] }> {
  let remaining = [...handles];
  const collected: ApifyItem[] = [];
  for (let i = 1; i <= attempts && remaining.length; i++) {
    const items = await runActor(i === 1 ? label : `${label} retry ${i - 1}`, inputFor(remaining));
    collected.push(...items.filter((it) => !isErrorItem(it)));
    const blocked = new Set(
      items
        .filter(isErrorItem)
        .map((it) =>
          String(it.inputUrl ?? it.url ?? "").match(/instagram\.com\/([^/]+)/)?.[1]?.toLowerCase(),
        )
        .filter(Boolean) as string[],
    );
    remaining = remaining.filter((h) => blocked.has(h.toLowerCase()));
  }
  return { items: collected, blocked: remaining };
}

// Instagram blocks some profiles for Apify's datacenter IPs while serving
// them fine from here — fall back to parsing the public page's og: tags.
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";

function parseCount(s: string | undefined): number | undefined {
  const m = String(s ?? "").trim().replace(/,/g, "").match(/^([\d.]+)([KkMm])?$/);
  if (!m) return undefined;
  const n = parseFloat(m[1]);
  return Math.round(m[2] ? n * (m[2].toLowerCase() === "k" ? 1e3 : 1e6) : n);
}

async function ogFallback(handle: string) {
  const res = await fetch(profileUrl(handle), { headers: { "User-Agent": UA } });
  if (!res.ok) return null;
  const html = await res.text();
  const og = (name: string) =>
    html.match(new RegExp(`<meta property="og:${name}" content="([^"]*)"`))?.[1];
  const m = (og("description") ?? "").match(
    /([\d.,]+[KkMm]?) Followers, ([\d.,]+[KkMm]?) Following, ([\d.,]+[KkMm]?) Posts/,
  );
  if (!m) return null;
  const title = (og("title") ?? "").replace(/&#(\d+);/g, (_, c) => String.fromCharCode(Number(c)));
  return {
    handle,
    username: handle,
    fullName: title.split("(")[0].trim(),
    followers: parseCount(m[1]),
    following: parseCount(m[2]),
    postsCount: parseCount(m[3]),
    source: "instagram-og-fallback",
  };
}

// Views for reels/videos; likes + comments as the score fallback for images.
const views = (p: ApifyItem) => p.videoPlayCount ?? p.videoViewCount ?? undefined;
const score = (p: ApifyItem) => views(p) ?? (p.likesCount ?? 0) + (p.commentsCount ?? 0);
// Emoji-safe truncation.
const trunc = (s: unknown, n: number) => [...String(s ?? "")].slice(0, n).join("");
const toMs = (iso: unknown) => {
  const ms = Date.parse(String(iso ?? ""));
  return Number.isNaN(ms) ? undefined : ms;
};

async function savePost(projectId: string, p: ApifyItem, ownerHandle: string, now: number) {
  await convex.mutation(api.content.upsertPost, {
    projectId,
    shortcode: String(p.shortCode),
    ownerHandle,
    url: p.url,
    type: p.type,
    caption: trunc(p.caption, 300),
    hashtags: JSON.stringify(p.hashtags ?? []),
    likes: p.likesCount ?? 0,
    comments: p.commentsCount ?? 0,
    views: views(p),
    score: score(p),
    postedAt: toMs(p.timestamp),
    displayUrl: p.displayUrl,
    fetchedAt: now,
  });
}

async function saveProfile(projectId: string, d: Record<string, any>, now: number) {
  await convex.mutation(api.content.upsertProfile, {
    projectId,
    handle: d.handle ?? d.username,
    username: d.username,
    fullName: d.fullName,
    followers: d.followers ?? d.followersCount ?? undefined,
    following: d.following ?? d.followsCount ?? undefined,
    postsCount: d.postsCount ?? undefined,
    biography: d.biography ?? undefined,
    profilePicUrl: d.profilePicUrl ?? d.profilePicUrlHD ?? undefined,
    source: d.source ?? "apify",
    fetchedAt: now,
  });
}

export async function pullProject(
  projectId: string,
  config: ProjectConfig,
  { force = false } = {},
): Promise<string> {
  const now = Date.now();
  const ttlMs = (config.pullTtlHours ?? 72) * 3600_000;
  const cooldownMs = (config.blockedRetryCooldownHours ?? 12) * 3600_000;
  const own = config.instagramHandle;
  const competitors = (config.competitors ?? []).map((c) => c.handle);
  const all = [own, ...competitors];

  // fresh → skip; blocked recently → cool down; otherwise pull.
  async function partition(kind: "profile" | "posts", handles: string[]): Promise<string[]> {
    if (force) return handles;
    const out: string[] = [];
    for (const h of handles) {
      const { lastSuccess, lastAttempt } = await convex.query(api.content.pullFreshness, {
        projectId,
        kind,
        handle: h.toLowerCase(),
      });
      if (lastSuccess && now - lastSuccess <= ttlMs) continue;
      if (lastAttempt && now - lastAttempt < cooldownMs && (!lastSuccess || lastAttempt > lastSuccess))
        continue;
      out.push(h);
    }
    return out;
  }
  const logPull = (kind: "profile" | "posts", handle: string, status: "ok" | "fallback" | "blocked", items: number) =>
    convex.mutation(api.content.logPull, {
      projectId,
      kind,
      handle: handle.toLowerCase(),
      status,
      items,
      fetchedAt: now,
    });

  const summary: string[] = [];

  // --- profiles
  const staleProfiles = await partition("profile", all);
  if (staleProfiles.length) {
    const { items } = await runWithRetry("profiles", staleProfiles, (hs) => ({
      directUrls: hs.map(profileUrl),
      resultsType: "details",
    }));
    const got = new Set<string>();
    for (const it of items) {
      if (!it.username) continue;
      await saveProfile(projectId, { ...it, handle: it.username }, now);
      await logPull("profile", it.username, "ok", 1);
      got.add(String(it.username).toLowerCase());
    }
    for (const h of staleProfiles.filter((h) => !got.has(h.toLowerCase()))) {
      const p = await ogFallback(h);
      if (p) {
        await saveProfile(projectId, p, now);
        await logPull("profile", h, "fallback", 1);
      } else await logPull("profile", h, "blocked", 0);
    }
    summary.push(`profiles: ${staleProfiles.length} pulled`);
  } else summary.push("profiles: fresh");

  // --- own posts
  if ((await partition("posts", [own])).length) {
    let { items } = await runWithRetry("my posts", [own], (hs) => ({
      directUrls: hs.map(profileUrl),
      resultsType: "posts",
      resultsLimit: 100,
    }));
    if (!items.some((p) => p.shortCode) && (config.knownPostUrls ?? []).length) {
      items = (
        await runActor("my posts (direct)", {
          directUrls: config.knownPostUrls,
          resultsType: "posts",
        })
      ).filter((it) => !isErrorItem(it) && it.shortCode);
    }
    let n = 0;
    for (const it of items) {
      if (!it.shortCode) continue;
      await savePost(projectId, it, (it.ownerUsername ?? own).toLowerCase(), now);
      n++;
    }
    await logPull("posts", own, n > 0 ? "ok" : "blocked", n);
    summary.push(`own posts: ${n}`);
  } else summary.push("own posts: fresh");

  // --- competitor posts
  const staleComp = await partition("posts", competitors);
  if (staleComp.length) {
    const { items, blocked } = await runWithRetry("competitor posts", staleComp, (hs) => ({
      directUrls: hs.map(profileUrl),
      resultsType: "posts",
      resultsLimit: 25,
    }));
    const counts: Record<string, number> = {};
    for (const it of items) {
      if (!it.shortCode || !it.ownerUsername) continue;
      await savePost(projectId, it, String(it.ownerUsername).toLowerCase(), now);
      const k = String(it.ownerUsername).toLowerCase();
      counts[k] = (counts[k] ?? 0) + 1;
    }
    for (const h of staleComp) {
      const n = counts[h.toLowerCase()] ?? 0;
      const wasBlocked = blocked.some((b) => b.toLowerCase() === h.toLowerCase());
      await logPull("posts", h, n > 0 ? "ok" : wasBlocked ? "blocked" : "ok", n);
    }
    summary.push(`competitor posts: ${items.length} across ${staleComp.length} handles`);
  } else summary.push("competitor posts: fresh");

  return summary.join("; ");
}
