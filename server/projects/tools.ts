// Dispatcher tools for the project registry (namespace boop-projects). Makes
// Boop aware of the user's software projects: when they say "Sigil" or
// "Twizzle", get_project returns current context (offerings, stage, live
// status, recent work) and update_project records what they tell you.

import { z } from "zod";
import { api } from "../../convex/_generated/api.js";
import { convex } from "../convex-client.js";
import { defineRuntimeTool } from "../runtimes/tool.js";
import { runtimeText, type RuntimeTool } from "../runtimes/types.js";

const NAMESPACE = "boop-projects";
const stageEnum = z.enum(["idea", "building", "beta", "live", "paused"]);

interface ProjectDoc {
  name: string;
  aliases: string[];
  summary: string;
  offerings: string[];
  stage: string;
  live: boolean;
  liveUrl?: string | null;
  version?: string | null;
  branch?: string | null;
  notes?: string | null;
  recentTasks?: { summary: string; at: number }[];
  lastSyncedAt?: number | null;
}

const day = (ms?: number | null) =>
  ms ? new Date(ms).toISOString().slice(0, 10) : null;

export function createProjectTools(): RuntimeTool[] {
  return [
    defineRuntimeTool(
      NAMESPACE,
      "list_projects",
      "List the user's software projects you already know about (name, one-line summary, dev-cycle stage, live status). Use when the user asks what you two are building, or to disambiguate a name.",
      {},
      async () => {
        const roster = (await convex.query(api.projects.roster, {})) as {
          name: string;
          aliases: string[];
          summary: string;
          stage: string;
          live: boolean;
        }[];
        if (!roster.length)
          return runtimeText("No projects registered yet.", false);
        return runtimeText(JSON.stringify(roster, null, 1));
      },
    ),

    defineRuntimeTool(
      NAMESPACE,
      "get_project",
      'Full current context for one project: summary, offerings, dev-cycle stage, live status + URL, version/branch, and recently shipped tasks. Call this whenever the user names a project (e.g. "Sigil", "Twizzle") and you need detail beyond the roster you already have.',
      {
        name: z.string().describe("Project name or alias the user used."),
      },
      async (args) => {
        const p = (await convex.query(api.projects.resolve, {
          nameOrAlias: args.name,
        })) as ProjectDoc | null;
        if (!p)
          return runtimeText(
            `No project matches "${args.name}". Use list_projects to see what's registered, or update_project to record a new one.`,
            false,
          );
        return runtimeText(
          JSON.stringify(
            {
              name: p.name,
              aliases: p.aliases,
              summary: p.summary,
              offerings: p.offerings,
              stage: p.stage,
              live: p.live,
              liveUrl: p.liveUrl ?? null,
              version: p.version ?? null,
              branch: p.branch ?? null,
              recentTasks: (p.recentTasks ?? []).map((t) => ({
                summary: t.summary,
                at: day(t.at),
              })),
              notes: p.notes ?? null,
              lastSyncedAt: day(p.lastSyncedAt),
            },
            null,
            1,
          ),
        );
      },
    ),

    defineRuntimeTool(
      NAMESPACE,
      "update_project",
      'Create or update what you know about a project when the user tells you something durable about it ("Sigil is in beta now", "Twizzle is live at …", "we just shipped X"). Fields you set here are marked user-authoritative and won\'t be overwritten by the repo sync. Only pass fields the user actually changed.',
      {
        name: z.string().describe("Project name (creates the project if new)."),
        summary: z
          .string()
          .optional()
          .describe("One-line description of what it is."),
        offerings: z
          .array(z.string())
          .optional()
          .describe("What it offers / its main features."),
        stage: stageEnum.optional().describe("Where it is in the dev cycle."),
        live: z.boolean().optional().describe("Whether it's live in production."),
        liveUrl: z.string().optional().describe("Production URL."),
        aliases: z
          .array(z.string())
          .optional()
          .describe("Other names the user calls it."),
        notes: z.string().optional().describe("Any other durable context."),
        add_task: z
          .string()
          .optional()
          .describe("A task just shipped/done, to append to recent work."),
      },
      async (args) => {
        const recentTasks = args.add_task
          ? [{ summary: args.add_task, at: Date.now() }]
          : undefined;
        const projectId = (await convex.mutation(api.projects.upsert, {
          source: "manual",
          name: args.name,
          summary: args.summary,
          offerings: args.offerings,
          stage: args.stage,
          live: args.live,
          liveUrl: args.liveUrl,
          aliases: args.aliases,
          notes: args.notes,
          ...(recentTasks ? { recentTasks } : {}),
        })) as string;
        return runtimeText(`Saved project "${args.name}" (${projectId}).`);
      },
    ),
  ];
}
