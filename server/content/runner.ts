// The weekly engine: pull → auto-match → bank refresh → plan → digest,
// per content project, recorded as a contentRun row for the Content tab.
//
// Scheduling: croner on CONTENT_CRON (default Mondays 08:00 Europe/London),
// but ONLY when CONTENT_ENGINE=1 — set on trolley's systemd unit and
// nowhere else, so a Mac dev server can never double-fire the pipeline.
// Manual runs (POST /content/run) work from any environment.

import { randomUUID } from "node:crypto";
import { Cron } from "croner";
import { convex } from "../convex-client.js";
import { api } from "../../convex/_generated/api.js";
import { pullProject } from "./pull.js";
import { autoMatch } from "./match.js";
import { refreshBank } from "./refresh.js";
import { planWeek } from "./planner.js";
import { sendDigest } from "./digest.js";
import { parseConfig, type ContentProjectRow, type StepResult } from "./types.js";

let running = false;

export function isEngineRunning(): boolean {
  return running;
}

export async function runPipeline(
  trigger: "schedule" | "manual",
  { force = false } = {},
): Promise<{ runIds: string[] }> {
  if (running) throw new Error("content engine already running");
  running = true;
  const runIds: string[] = [];
  try {
    const projects = (await convex.query(api.content.listProjects, {})) as ContentProjectRow[];
    for (const project of projects) {
      const runId = randomUUID();
      runIds.push(runId);
      const config = parseConfig(project);
      await convex.mutation(api.content.createContentRun, {
        runId,
        projectId: project.projectId,
        trigger,
      });
      const steps: StepResult[] = [];
      const step = async (name: string, fn: () => Promise<string>, optional = false) => {
        try {
          steps.push({ step: name, ok: true, detail: await fn() });
        } catch (e) {
          const detail = (e as Error).message.slice(0, 300);
          steps.push({ step: name, ok: false, detail });
          console.error(`[content:${name}] ${project.projectId}: ${detail}`);
          if (!optional) throw e;
        } finally {
          await convex.mutation(api.content.updateContentRun, {
            runId,
            status: "running",
            steps: JSON.stringify(steps),
          });
        }
      };

      try {
        await step("pull", () => pullProject(project.projectId, config, { force }));
        await step("match", () => autoMatch(project.projectId, config));
        // Refresh is best-effort, exactly like the old weekly-run.js: a bad
        // generation keeps the existing bank and the pipeline continues.
        await step("refresh", () => refreshBank(project, config), true);
        await step("plan", () => planWeek(project.projectId, config));
        await step("digest", () => sendDigest(project.projectId, config, project.name, steps), true);
        await convex.mutation(api.content.updateContentRun, {
          runId,
          status: "completed",
          steps: JSON.stringify(steps),
        });
      } catch (e) {
        await convex.mutation(api.content.updateContentRun, {
          runId,
          status: "failed",
          steps: JSON.stringify(steps),
          error: (e as Error).message.slice(0, 500),
        });
      }
    }
  } finally {
    running = false;
  }
  return { runIds };
}

const SCHEDULE = process.env.CONTENT_CRON ?? "0 8 * * 1";
const TIMEZONE = process.env.CONTENT_TZ ?? "Europe/London";

export function engineStatus() {
  const armed = process.env.CONTENT_ENGINE === "1";
  return {
    armed,
    schedule: SCHEDULE,
    timezone: TIMEZONE,
    running,
  };
}

export function startContentEngine(): void {
  if (process.env.CONTENT_ENGINE !== "1") {
    console.log("[content] engine not armed (set CONTENT_ENGINE=1) — manual runs only");
    return;
  }
  new Cron(SCHEDULE, { timezone: TIMEZONE }, async () => {
    // The enable toggle lives in Convex settings so the dashboard can flip
    // it without a redeploy.
    const enabled = (await convex.query(api.settings.get, {
      key: "content_engine_enabled",
    })) as string | null;
    if (enabled === "false") {
      console.log("[content] engine disabled in settings — skipping scheduled run");
      return;
    }
    console.log("[content] scheduled weekly run starting");
    try {
      await runPipeline("schedule");
    } catch (e) {
      console.error("[content] scheduled run failed:", (e as Error).message);
    }
  });
  console.log(`[content] engine armed: ${SCHEDULE} (${TIMEZONE})`);
}
