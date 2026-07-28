// Dispatcher tools for the content desk (namespace boop-content) — the
// phase-4 bridge that makes texting Boop content-aware: "give me two
// unposted ideas for Saturday" hits live Convex truth, no sub-agent needed.

import { z } from "zod";
import { api } from "../../convex/_generated/api.js";
import { convex } from "../convex-client.js";
import { defineRuntimeTool } from "../runtimes/tool.js";
import { runtimeText, type RuntimeTool } from "../runtimes/types.js";
import { parseConfig, type ContentProjectRow } from "./types.js";

const NAMESPACE = "boop-content";
const dayMs = 864e5;

async function defaultProject(): Promise<ContentProjectRow | null> {
  const projects = (await convex.query(api.content.listProjects, {})) as ContentProjectRow[];
  return projects[0] ?? null;
}

type Usage = Record<
  string,
  { timesUsed: number; lastPostedAt: number; formats: Record<string, number> }
>;

export function createContentTools(): RuntimeTool[] {
  return [
    defineRuntimeTool(
      NAMESPACE,
      "list_content_ideas",
      `List the content desk's idea bank with publish state. Use this DIRECTLY (no spawn_agent) when the user asks for content ideas, what to post, unposted/fresh ideas, or what's in the bank. Each idea includes: title, enemy, failure moment, formats (best first), timesUsed, lastPostedAt, and state ("ready" = safe to post now, "cooling" = posted within the cooldown window, "retired"). "Unposted" ideas are those with timesUsed 0; "ready" is the right filter for what can go out today.`,
      {
        ready_only: z
          .boolean()
          .optional()
          .default(false)
          .describe("Only ideas that are active and not cooling."),
      },
      async (args) => {
        const project = await defaultProject();
        if (!project) return runtimeText("No content project configured.", false);
        const config = parseConfig(project);
        const cooldownMs = (config.ideaCooldownDays ?? 14) * dayMs;
        const ideas = (await convex.query(api.content.listIdeas, {
          projectId: project.projectId,
        })) as { ideaId: string; retired: boolean; data: string }[];
        const usage = (await convex.query(api.content.ideaUsage, {
          projectId: project.projectId,
        })) as Usage;
        const rows = ideas.map((r) => {
          const idea = JSON.parse(r.data) as {
            title: string;
            enemy: string;
            failureMoment?: string;
            formats?: string[];
          };
          const u = usage[r.ideaId];
          const cooling = !r.retired && u && Date.now() - u.lastPostedAt < cooldownMs;
          return {
            ideaId: r.ideaId,
            title: idea.title,
            enemy: idea.enemy,
            failureMoment: idea.failureMoment,
            formats: idea.formats,
            timesUsed: u?.timesUsed ?? 0,
            lastPostedAt: u ? new Date(u.lastPostedAt).toISOString().slice(0, 10) : null,
            state: r.retired ? "retired" : cooling ? "cooling" : "ready",
          };
        });
        const filtered = args.ready_only ? rows.filter((r) => r.state === "ready") : rows;
        return runtimeText(JSON.stringify(filtered, null, 1));
      },
    ),
    defineRuntimeTool(
      NAMESPACE,
      "get_content_idea",
      `Full detail for one content idea: the angle, all 3 hooks, the beat-by-beat script, CTA, and the UGC creator brief. Use after list_content_ideas when the user wants the actual content for an idea.`,
      {
        idea_id: z.string().describe("The ideaId from list_content_ideas."),
      },
      async (args) => {
        const project = await defaultProject();
        if (!project) return runtimeText("No content project configured.", false);
        const ideas = (await convex.query(api.content.listIdeas, {
          projectId: project.projectId,
        })) as { ideaId: string; data: string }[];
        const idea = ideas.find((i) => i.ideaId === args.idea_id);
        if (!idea) return runtimeText(`No idea "${args.idea_id}".`, false);
        const scripts = (await convex.query(api.content.listScripts, {
          projectId: project.projectId,
        })) as { ideaId: string; data: string }[];
        const script = scripts.find((s) => s.ideaId === args.idea_id);
        return runtimeText(
          JSON.stringify(
            {
              idea: JSON.parse(idea.data),
              script: script ? JSON.parse(script.data) : null,
            },
            null,
            1,
          ),
        );
      },
    ),
    defineRuntimeTool(
      NAMESPACE,
      "get_content_slots",
      `The content calendar: planned slots with date, time, idea, format, and posted state. Use DIRECTLY when the user asks what's scheduled, what to post on a given day, or today's plan. Dates are YYYY-MM-DD.`,
      {
        from: z.string().optional().describe("Start date YYYY-MM-DD (default today)."),
        to: z.string().optional().describe("End date YYYY-MM-DD (default from+7 days)."),
      },
      async (args) => {
        const project = await defaultProject();
        if (!project) return runtimeText("No content project configured.", false);
        const from = args.from ?? new Date().toISOString().slice(0, 10);
        const to =
          args.to ?? new Date(Date.parse(from) + 7 * dayMs).toISOString().slice(0, 10);
        const slots = (await convex.query(api.content.listSlots, {
          projectId: project.projectId,
          from,
          to,
        })) as Record<string, unknown>[];
        const rows = slots.map((s) => ({
          slotKey: s.slotKey,
          date: s.slotDate,
          time: s.slotTime,
          ideaId: s.ideaId,
          title: s.title,
          format: s.format,
          posted: s.postedAt ? `yes (${s.postedVia})` : "no",
        }));
        return runtimeText(JSON.stringify(rows, null, 1));
      },
    ),
    defineRuntimeTool(
      NAMESPACE,
      "mark_content_posted",
      `Mark a content idea as posted on one platform (instagram | tiktok | facebook | youtube-shorts), capturing the live link. Writes the content log that drives idea cooldowns; the link lets a future stats pull track the post. Use when the user says they posted something. Pass the link if they give one.`,
      {
        idea_id: z.string().describe("The ideaId from list_content_ideas / get_content_slots."),
        platform: z.string().describe("Platform it was posted on."),
        url: z.string().optional().describe("Link to the posted video, if available."),
        slot_key: z.string().optional().describe("The slotKey from get_content_slots, to stamp the calendar too."),
      },
      async (args) => {
        const project = await defaultProject();
        if (!project) return runtimeText("No content project configured.", false);
        const { written } = (await convex.mutation(api.content.markIdeaPosted, {
          projectId: project.projectId,
          ideaId: args.idea_id,
          slotKey: args.slot_key,
          posts: [{ platform: args.platform, url: args.url ?? "" }],
        })) as { written: number };
        return runtimeText(
          written
            ? `Marked "${args.idea_id}" posted on ${args.platform}.`
            : `Already logged "${args.idea_id}" on ${args.platform}.`,
        );
      },
    ),
  ];
}
