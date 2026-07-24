import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api.js";
import {
  EmptyState,
  HeaderPill,
  PanelPage,
  bodyTextClass,
  mutedTextClass,
  panelCardClass,
  subtlePanelClass,
} from "./PanelPrimitives.js";

// Content desk panel (fork-local addition, see CONTENT.md).
// Phase 1: read the migrated desk (ideas, scripts, calendar, log) and mark
// slots posted per platform. Planning/refresh automations arrive in phase 2.

interface SlotRow {
  slotKey: string;
  slotDate: string;
  slotTime: string;
  ideaId: string;
  title?: string;
  enemy?: string;
  format?: string;
  scripted: boolean;
  postedAt?: number;
  postedVia?: string;
}

interface IdeaRow {
  ideaId: string;
  title: string;
  enemy: string;
  retired: boolean;
  data: string;
  creative?: string;
}

interface LogRow {
  ideaId: string;
  format?: string;
  platform: string;
  source: string;
  postedAt: number;
}

interface RunRow {
  runId: string;
  trigger: string;
  status: "running" | "completed" | "failed";
  steps?: string;
  error?: string;
  startedAt: number;
  completedAt?: number;
}

interface EngineStatus {
  armed: boolean;
  schedule: string;
  timezone: string;
  running: boolean;
}

type Usage = Record<
  string,
  { timesUsed: number; lastPostedAt: number; formats: Record<string, number> }
>;

const dayMs = 24 * 60 * 60 * 1000;

function isoDate(offsetDays = 0): string {
  return new Date(Date.now() + offsetDays * dayMs).toISOString().slice(0, 10);
}

function formatWhen(ms: number): string {
  return new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function ContentPanel({ isDark }: { isDark: boolean }) {
  const projects = useQuery(api.content.listProjects, {});
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const projectId = selectedProject ?? projects?.[0]?.projectId ?? null;

  if (projects === undefined) {
    return (
      <PanelPage eyebrow="Content" title="Content desk" description="Loading…">
        <EmptyState isDark={isDark}>Loading…</EmptyState>
      </PanelPage>
    );
  }

  if (!projects.length || !projectId) {
    return (
      <PanelPage
        eyebrow="Content"
        title="Content desk"
        description="Ideas, calendar, and content log per project."
      >
        <EmptyState isDark={isDark}>
          No content projects yet. Import one with{" "}
          <span className="mono">npx tsx scripts/content-import.ts &lt;projectDir&gt;</span>
        </EmptyState>
      </PanelPage>
    );
  }

  return (
    <ProjectView
      key={projectId}
      isDark={isDark}
      projectId={projectId}
      projects={projects.map((p: { projectId: string; name: string; config: string }) => p)}
      onSelectProject={setSelectedProject}
    />
  );
}

function ProjectView({
  isDark,
  projectId,
  projects,
  onSelectProject,
}: {
  isDark: boolean;
  projectId: string;
  projects: { projectId: string; name: string; config: string }[];
  onSelectProject: (id: string) => void;
}) {
  const project = projects.find((p) => p.projectId === projectId)!;
  const config = useMemo(() => {
    try {
      return JSON.parse(project.config) as {
        platforms?: string[];
        conceptsPerDay?: number;
        ideaCooldownDays?: number;
      };
    } catch {
      return {};
    }
  }, [project.config]);
  const platforms = config.platforms ?? ["instagram"];
  const cooldownDays = config.ideaCooldownDays ?? 14;

  const slots = useQuery(api.content.listSlots, {
    projectId,
    from: isoDate(-1),
    to: isoDate(7),
  }) as SlotRow[] | undefined;
  const ideas = useQuery(api.content.listIdeas, { projectId }) as IdeaRow[] | undefined;
  const usage = useQuery(api.content.ideaUsage, { projectId }) as Usage | undefined;
  const stats = useQuery(api.content.backlogStats, { projectId }) as
    | { planned: number; posted: number; backlog: number }
    | undefined;
  const log = useQuery(api.content.recentLog, { projectId, limit: 25 }) as
    | LogRow[]
    | undefined;

  const ideaTitles = useMemo(() => {
    const map: Record<string, string> = {};
    for (const idea of ideas ?? []) map[idea.ideaId] = idea.title;
    return map;
  }, [ideas]);

  const slotsByDate = useMemo(() => {
    const groups = new Map<string, SlotRow[]>();
    for (const slot of slots ?? []) {
      const list = groups.get(slot.slotDate) ?? [];
      list.push(slot);
      groups.set(slot.slotDate, list);
    }
    return [...groups.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, list]) => ({
        date,
        list: list.sort((a, b) => a.slotTime.localeCompare(b.slotTime)),
      }));
  }, [slots]);

  return (
    <PanelPage
      eyebrow="Content"
      title="Content desk"
      description="Calendar slots, the idea bank with cooldowns, and the content log."
      stat={
        stats && (
          <HeaderPill isDark={isDark}>
            {stats.posted}/{stats.planned} posted · backlog {stats.backlog}
          </HeaderPill>
        )
      }
      action={
        projects.length > 1 ? (
          <select
            value={projectId}
            onChange={(e) => onSelectProject(e.target.value)}
            className={`rounded-2xl border px-2.5 py-1 text-xs ${
              isDark
                ? "border-white/10 bg-white/5 text-zinc-300"
                : "border-zinc-200 bg-white text-zinc-600"
            }`}
          >
            {projects.map((p) => (
              <option key={p.projectId} value={p.projectId}>
                {p.name}
              </option>
            ))}
          </select>
        ) : (
          <HeaderPill isDark={isDark}>{project.name}</HeaderPill>
        )
      }
    >
      <EngineCard isDark={isDark} projectId={projectId} />

      <section className={panelCardClass(isDark, "p-4")}>
        <h3 className="text-sm font-medium">This week</h3>
        <p className={`mt-0.5 text-xs ${mutedTextClass(isDark)}`}>
          Yesterday through the next 7 days. Instagram posts are auto-matched (phase 2);
          mark other platforms here.
        </p>
        <div className="mt-3 space-y-3">
          {slotsByDate.length === 0 && (
            <EmptyState isDark={isDark}>
              No planned slots in this window. The planner automation lands in phase 2 —
              until then, slots come from the import.
            </EmptyState>
          )}
          {slotsByDate.map(({ date, list }) => (
            <div key={date}>
              <div className={`mb-1.5 text-[11px] font-medium uppercase tracking-[0.08em] ${mutedTextClass(isDark)}`}>
                {date === isoDate(0) ? `Today · ${date}` : date}
              </div>
              <div className="space-y-1.5">
                {list.map((slot) => (
                  <SlotCard
                    key={slot.slotKey}
                    slot={slot}
                    platforms={platforms}
                    isDark={isDark}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className={panelCardClass(isDark, "p-4")}>
        <h3 className="text-sm font-medium">Idea bank</h3>
        <p className={`mt-0.5 text-xs ${mutedTextClass(isDark)}`}>
          One enemy per idea. Cooldown {cooldownDays} days per execution.
        </p>
        <div className="mt-3 overflow-x-auto">
          {!ideas?.length ? (
            <EmptyState isDark={isDark}>No ideas imported yet.</EmptyState>
          ) : (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className={mutedTextClass(isDark)}>
                  <th className="pb-2 pr-3 font-medium">Idea</th>
                  <th className="pb-2 pr-3 font-medium">Enemy</th>
                  <th className="pb-2 pr-3 font-medium">Used</th>
                  <th className="pb-2 pr-3 font-medium">Last posted</th>
                  <th className="pb-2 font-medium">State</th>
                </tr>
              </thead>
              <tbody className={bodyTextClass(isDark)}>
                {[...ideas]
                  .sort((a, b) => Number(a.retired) - Number(b.retired) || a.title.localeCompare(b.title))
                  .map((idea) => {
                    const u = usage?.[idea.ideaId];
                    const lastPosted = u?.lastPostedAt;
                    const cooling =
                      !idea.retired && lastPosted !== undefined &&
                      Date.now() - lastPosted < cooldownDays * dayMs;
                    return (
                      <tr
                        key={idea.ideaId}
                        className={`border-t ${isDark ? "border-white/5" : "border-zinc-100"}`}
                      >
                        <td className="py-2 pr-3">
                          <div className="font-medium">{idea.title}</div>
                          <div className={`mono text-[10px] ${mutedTextClass(isDark)}`}>{idea.ideaId}</div>
                        </td>
                        <td className="py-2 pr-3">{idea.enemy}</td>
                        <td className="py-2 pr-3 mono">{u?.timesUsed ?? 0}</td>
                        <td className="py-2 pr-3">{lastPosted ? formatWhen(lastPosted) : "—"}</td>
                        <td className="py-2">
                          <StatePill
                            isDark={isDark}
                            label={idea.retired ? "retired" : cooling ? "cooling" : "ready"}
                            tone={idea.retired ? "muted" : cooling ? "warn" : "ok"}
                          />
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section className={panelCardClass(isDark, "p-4")}>
        <h3 className="text-sm font-medium">Content log</h3>
        <p className={`mt-0.5 text-xs ${mutedTextClass(isDark)}`}>
          Every published execution, newest first.
        </p>
        <div className="mt-3 space-y-1.5">
          {!log?.length ? (
            <EmptyState isDark={isDark}>Nothing logged yet.</EmptyState>
          ) : (
            log.map((row, i) => (
              <div
                key={`${row.ideaId}-${row.postedAt}-${i}`}
                className={subtlePanelClass(isDark, "flex items-center justify-between gap-3 px-3 py-2 text-xs")}
              >
                <div className="min-w-0">
                  <span className="font-medium">{ideaTitles[row.ideaId] ?? row.ideaId}</span>
                  {row.format && (
                    <span className={`ml-2 ${mutedTextClass(isDark)}`}>{row.format}</span>
                  )}
                </div>
                <div className={`flex shrink-0 items-center gap-2 ${mutedTextClass(isDark)}`}>
                  <span className="mono">{row.platform}</span>
                  <span>{formatWhen(row.postedAt)}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </PanelPage>
  );
}

function EngineCard({ isDark, projectId }: { isDark: boolean; projectId: string }) {
  const [engine, setEngine] = useState<EngineStatus | null>(null);
  const [triggering, setTriggering] = useState(false);
  const enabledSetting = useQuery(api.settings.get, { key: "content_engine_enabled" }) as
    | string
    | null
    | undefined;
  const setSetting = useMutation(api.settings.set);
  const runs = useQuery(api.content.recentContentRuns, { projectId, limit: 5 }) as
    | RunRow[]
    | undefined;
  const enabled = enabledSetting !== "false";
  const latest = runs?.[0];
  const latestSteps: { step: string; ok: boolean; detail: string }[] = useMemo(() => {
    try {
      return latest?.steps ? JSON.parse(latest.steps) : [];
    } catch {
      return [];
    }
  }, [latest?.steps]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/content/engine", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => {
        if (!cancelled) setEngine(s);
      })
      .catch(() => {
        if (!cancelled) setEngine(null);
      });
    return () => {
      cancelled = true;
    };
  }, [latest?.status]);

  async function runNow() {
    setTriggering(true);
    try {
      await fetch("/api/content/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
    } finally {
      setTriggering(false);
    }
  }

  return (
    <section className={panelCardClass(isDark, "p-4")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium">Weekly engine</h3>
          <p className={`mt-0.5 text-xs ${mutedTextClass(isDark)}`}>
            Pull → auto-match → bank refresh → plan → summary memory → digest.{" "}
            {engine
              ? engine.armed
                ? `Scheduled ${engine.schedule} (${engine.timezone}).`
                : "Not armed on this server (manual runs only)."
              : "Engine status unavailable."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSetting({ key: "content_engine_enabled", value: enabled ? "false" : "true" })}
            className={`rounded-lg border px-2 py-1 text-[11px] font-medium ${
              enabled
                ? isDark
                  ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700"
                : isDark
                  ? "border-white/10 bg-white/5 text-zinc-500"
                  : "border-zinc-200 bg-zinc-50 text-zinc-500"
            }`}
            title="Applies to scheduled runs; manual runs always work"
          >
            {enabled ? "enabled" : "disabled"}
          </button>
          <button
            type="button"
            disabled={triggering || latest?.status === "running"}
            onClick={runNow}
            className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium disabled:opacity-50 ${
              isDark
                ? "border-white/10 bg-white/5 text-zinc-100 hover:bg-white/10"
                : "border-zinc-200 bg-zinc-50 text-zinc-900 hover:bg-zinc-100"
            }`}
          >
            {latest?.status === "running" ? "running…" : "Run now"}
          </button>
        </div>
      </div>

      {latest && (
        <div className={subtlePanelClass(isDark, "mt-3 px-3 py-2 text-xs")}>
          <div className="flex items-center justify-between gap-2">
            <span className={bodyTextClass(isDark)}>
              Last run: <span className="mono">{latest.trigger}</span> ·{" "}
              {new Date(latest.startedAt).toLocaleString("en-GB", {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            <span
              className={
                latest.status === "completed"
                  ? "text-emerald-500"
                  : latest.status === "failed"
                    ? "text-rose-400"
                    : "text-amber-400"
              }
            >
              {latest.status}
            </span>
          </div>
          {latestSteps.length > 0 && (
            <ul className={`mt-1.5 space-y-0.5 ${mutedTextClass(isDark)}`}>
              {latestSteps.map((s) => (
                <li key={s.step}>
                  <span className={s.ok ? "text-emerald-500" : "text-rose-400"}>
                    {s.ok ? "✓" : "✗"}
                  </span>{" "}
                  {s.step}: {s.detail}
                </li>
              ))}
            </ul>
          )}
          {latest.error && <div className="mt-1 text-rose-400">{latest.error}</div>}
        </div>
      )}
    </section>
  );
}

function SlotCard({
  slot,
  platforms,
  isDark,
}: {
  slot: SlotRow;
  platforms: string[];
  isDark: boolean;
}) {
  const markPosted = useMutation(api.content.markSlotPosted);
  const [pending, setPending] = useState<string | null>(null);

  async function handleMark(platform: string) {
    setPending(platform);
    try {
      await markPosted({ slotKey: slot.slotKey, platform });
    } finally {
      setPending(null);
    }
  }

  return (
    <div className={subtlePanelClass(isDark, "px-3 py-2")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs">
            <span className={`mono ${mutedTextClass(isDark)}`}>{slot.slotTime}</span>
            <span className={`font-medium ${bodyTextClass(isDark)}`}>
              {slot.title ?? slot.ideaId}
            </span>
            {slot.format && (
              <span className={`rounded-lg border px-1.5 py-0.5 text-[10px] ${
                isDark ? "border-white/10 text-zinc-400" : "border-zinc-200 text-zinc-500"
              }`}>
                {slot.format}
              </span>
            )}
          </div>
          {slot.enemy && (
            <div className={`mt-0.5 text-[11px] ${mutedTextClass(isDark)}`}>
              enemy: {slot.enemy}
            </div>
          )}
        </div>
        {slot.postedAt ? (
          <StatePill
            isDark={isDark}
            label={`posted · ${slot.postedVia ?? "unknown"}`}
            tone="ok"
          />
        ) : (
          <div className="flex flex-wrap items-center gap-1">
            {platforms.map((platform) => (
              <button
                key={platform}
                type="button"
                disabled={pending !== null}
                onClick={() => handleMark(platform)}
                className={`rounded-lg border px-2 py-1 text-[10px] font-medium disabled:opacity-50 ${
                  isDark
                    ? "border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10"
                    : "border-zinc-200 bg-zinc-50 text-zinc-800 hover:bg-zinc-100"
                }`}
                title={`Mark posted on ${platform}`}
              >
                {pending === platform ? "…" : platform}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatePill({
  isDark,
  label,
  tone,
}: {
  isDark: boolean;
  label: string;
  tone: "ok" | "warn" | "muted";
}) {
  const toneClass =
    tone === "ok"
      ? isDark
        ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300"
        : "border-emerald-200 bg-emerald-50 text-emerald-700"
      : tone === "warn"
        ? isDark
          ? "border-amber-400/20 bg-amber-400/10 text-amber-300"
          : "border-amber-200 bg-amber-50 text-amber-700"
        : isDark
          ? "border-white/10 bg-white/5 text-zinc-500"
          : "border-zinc-200 bg-zinc-50 text-zinc-400";
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-lg border px-2 py-0.5 text-[10px] font-medium ${toneClass}`}>
      {label}
    </span>
  );
}
