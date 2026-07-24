// The Planner — port of the scheduling logic from content-agent's
// run-agents.js. Deterministic: no LLM involved. Candidates are
// (idea, format) pairs; never repeat an exact execution inside the
// cooldown; prefer the least-recently-used idea; avoid the same idea
// twice a day and the same enemy back-to-back.

import { convex } from "../convex-client.js";
import { api } from "../../convex/_generated/api.js";
import type { BankIdea, ProjectConfig } from "./types.js";

const SLOT_TIMES_ALL = ["09:00", "13:00", "18:00", "11:00", "20:00"];
const dayMs = 864e5;

type Usage = Record<
  string,
  { timesUsed: number; lastPostedAt: number; formats: Record<string, number> }
>;

export async function planWeek(projectId: string, config: ProjectConfig): Promise<string> {
  const conceptsPerDay = config.conceptsPerDay ?? 3;
  const cooldownMs = (config.ideaCooldownDays ?? 14) * dayMs;
  const slotTimes = SLOT_TIMES_ALL.slice(0, conceptsPerDay);

  const ideaRows = (await convex.query(api.content.listIdeas, { projectId })) as {
    ideaId: string;
    retired: boolean;
    data: string;
  }[];
  const scripts = (await convex.query(api.content.listScripts, { projectId })) as {
    ideaId: string;
  }[];
  const scripted = new Set(scripts.map((s) => s.ideaId));
  const usage = (await convex.query(api.content.ideaUsage, { projectId })) as Usage;

  const ideas: BankIdea[] = ideaRows
    .filter((r) => !r.retired)
    .map((r) => JSON.parse(r.data) as BankIdea);
  if (!ideas.length) return "no active ideas — nothing planned";

  const combos = ideas.flatMap((i) => (i.formats ?? []).map((f) => ({ idea: i, format: f })));
  const plannedAt: Record<string, number> = {}; // `${ideaId}|${format}` -> planned day ms
  let planned = 0;

  const start = new Date();
  start.setDate(start.getDate() + 1);
  let prevEnemy: string | null = null;

  for (let d = 0; d < 7; d++) {
    const day = new Date(start);
    day.setDate(start.getDate() + d);
    const dayTime = day.getTime();
    const slotDate = day.toISOString().slice(0, 10);
    const todayIdeas = new Set<string>();

    for (const time of [...slotTimes].sort()) {
      let best: { idea: BankIdea; format: string } | null = null;
      let bestScore = Infinity;
      for (const c of combos) {
        const key = `${c.idea.id}|${c.format}`;
        const u = usage[c.idea.id];
        const lastExec = plannedAt[key] ?? u?.formats?.[c.format] ?? null;
        const lastIdea = u?.lastPostedAt ?? 0;
        let score = 0;
        if (lastExec && dayTime - lastExec < cooldownMs) score += 100; // execution in cooldown
        if (todayIdeas.has(c.idea.id)) score += 50; // same idea today
        if (c.idea.enemy === prevEnemy) score += 10; // same enemy back-to-back
        score += lastIdea / 1e13; // prefer least-recently-used idea
        score += (c.idea.formats ?? []).indexOf(c.format); // prefer the idea's best format
        if (score < bestScore) {
          bestScore = score;
          best = c;
        }
      }
      if (!best) continue;
      plannedAt[`${best.idea.id}|${best.format}`] = dayTime;
      todayIdeas.add(best.idea.id);
      prevEnemy = best.idea.enemy;
      await convex.mutation(api.content.upsertSlot, {
        projectId,
        slotDate,
        slotTime: time,
        ideaId: best.idea.id,
        title: best.idea.title,
        enemy: best.idea.enemy,
        format: best.format,
        scripted: scripted.has(best.idea.id),
        plannedAt: Date.now(),
      });
      planned++;
    }
  }
  return `${planned} slots over 7 days (${conceptsPerDay}/day)`;
}
