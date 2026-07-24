// Telegram digest — port of content-agent's send-digest.js, rebuilt from
// Convex state. Requires TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in the
// environment (no auto-discovery on the server — set both explicitly).

import { convex } from "../convex-client.js";
import { api } from "../../convex/_generated/api.js";
import type { ProjectConfig, StepResult } from "./types.js";

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
const full = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("en-GB"));

export async function sendDigest(
  projectId: string,
  config: ProjectConfig,
  name: string,
  steps: StepResult[],
): Promise<string> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return "skipped (TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID not set)";

  const own = config.instagramHandle.toLowerCase();
  const profile = (await convex.query(api.content.getProfile, {
    projectId,
    handle: own,
  })) as { followers?: number } | null;
  const posts = (await convex.query(api.content.listPosts, {
    projectId,
    ownerHandle: own,
  })) as { score: number; views?: number }[];
  const stats = (await convex.query(api.content.backlogStats, { projectId })) as {
    planned: number;
    posted: number;
    backlog: number;
  };
  const today = new Date().toISOString().slice(0, 10);
  const week = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
  const slots = (await convex.query(api.content.listSlots, {
    projectId,
    from: today,
    to: week,
  })) as { slotDate: string; slotTime: string; title?: string; format?: string; enemy?: string }[];
  const next = slots.sort(
    (a, b) => a.slotDate.localeCompare(b.slotDate) || a.slotTime.localeCompare(b.slotTime),
  )[0];

  const lines = [
    `<b>${esc(name)} content desk — weekly run</b>`,
    "",
    `Followers: <b>${full(profile?.followers)}</b>`,
    `Top post score: <b>${full(posts[0]?.score)}</b>`,
    `Slots: ${stats.posted}/${stats.planned} posted, backlog ${stats.backlog}`,
    next
      ? `Next up: ${esc(next.slotDate)} ${esc(next.slotTime)} — ${esc(next.title)} (${esc(next.format)}, enemy: ${esc(next.enemy)})`
      : "Next up: nothing planned",
    "",
    "<b>Run steps</b>",
    ...steps.map((s) => `${s.ok ? "✓" : "✗"} ${esc(s.step)}: ${esc(s.detail)}`),
    "",
    `Dashboard: https://trolley.oluseyi.dev (Content tab)`,
  ];

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: lines.join("\n"), parse_mode: "HTML" }),
  });
  const json = (await res.json()) as { ok: boolean; description?: string };
  if (!json.ok) throw new Error(`telegram sendMessage failed: ${json.description}`);
  return "sent";
}
