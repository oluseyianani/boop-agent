import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  Cancel01Icon,
  Delete02Icon,
  ArrowReloadHorizontalIcon,
  Link04Icon,
} from "@hugeicons/core-free-icons";
import { createPortal } from "react-dom";
import { api } from "../../../convex/_generated/api.js";
import {
  EmptyState,
  PanelPage,
  bodyTextClass,
  mutedTextClass,
  panelCardClass,
  subtlePanelClass,
} from "./PanelPrimitives.js";

type Stage = "idea" | "building" | "beta" | "live" | "paused";

const STAGES: Stage[] = ["idea", "building", "beta", "live", "paused"];

const STAGE_BADGE: Record<Stage, { dark: string; light: string }> = {
  idea: {
    dark: "text-zinc-400 bg-white/5 border-white/10",
    light: "text-zinc-600 bg-zinc-50 border-zinc-200",
  },
  building: {
    dark: "text-sky-400 bg-sky-400/10 border-sky-500/20",
    light: "text-sky-600 bg-sky-50 border-sky-200",
  },
  beta: {
    dark: "text-violet-400 bg-violet-400/10 border-violet-500/20",
    light: "text-violet-600 bg-violet-50 border-violet-200",
  },
  live: {
    dark: "text-emerald-400 bg-emerald-400/10 border-emerald-500/20",
    light: "text-emerald-600 bg-emerald-50 border-emerald-200",
  },
  paused: {
    dark: "text-amber-400 bg-amber-400/10 border-amber-500/20",
    light: "text-amber-600 bg-amber-50 border-amber-200",
  },
};

interface ProjectRecord {
  projectId: string;
  name: string;
  aliases: string[];
  summary: string;
  offerings: string[];
  stage: Stage;
  live: boolean;
  liveUrl?: string;
  repoPath?: string;
  recentTasks: { summary: string; at: number }[];
  version?: string;
  branch?: string;
  notes?: string;
  fieldSources?: string;
  lastSyncedAt?: number;
  updatedAt: number;
}

export function ProjectsPanel({ isDark }: { isDark: boolean }) {
  const projects = useQuery(api.projects.list) as ProjectRecord[] | undefined;
  const [editing, setEditing] = useState<ProjectRecord | "new" | null>(null);
  const [sync, setSync] = useState<{ msg: string; error?: boolean } | null>(null);
  const [syncing, setSyncing] = useState(false);

  async function runSync(projectId?: string) {
    setSyncing(true);
    setSync(null);
    try {
      const res = await fetch("/api/projects/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(projectId ? { projectId } : {}),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        synced?: number;
        skipped?: number;
      };
      if (!res.ok) throw new Error(body.error ?? `Sync failed (${res.status})`);
      setSync({
        msg: `Synced ${body.synced ?? 0}${body.skipped ? `, ${body.skipped} skipped (no repo path)` : ""}.`,
      });
    } catch (err) {
      setSync({
        msg: err instanceof Error ? err.message : String(err),
        error: true,
      });
    } finally {
      setSyncing(false);
    }
  }

  const rows = projects ?? [];

  return (
    <PanelPage
      eyebrow="Context"
      title="Projects"
      description="What Boop knows about the software you're building — synced from your repos, corrected by you."
      action={
        <div className="flex items-center gap-2">
          <button
            onClick={() => void runSync()}
            disabled={syncing}
            className={syncBtnClass(isDark)}
            title="Pull fresh context from all repos (runs where the repos live)"
          >
            <HugeiconsIcon
              icon={ArrowReloadHorizontalIcon}
              size={14}
              className={syncing ? "spin-smooth" : ""}
            />
            Sync all
          </button>
          <button onClick={() => setEditing("new")} className={primaryBtnClass(isDark)}>
            <HugeiconsIcon icon={Add01Icon} size={14} />
            New project
          </button>
        </div>
      }
    >
      {sync && (
        <div
          className={`rounded-2xl border px-3 py-2 text-xs ${
            sync.error
              ? isDark
                ? "border-rose-400/20 bg-rose-400/10 text-rose-200"
                : "border-rose-200 bg-rose-50 text-rose-700"
              : isDark
                ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
                : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          {sync.msg}
        </div>
      )}

      {projects === undefined ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }, (_, i) => (
            <div
              key={i}
              className={`h-20 rounded-2xl shimmer ${isDark ? "bg-white/5" : "bg-zinc-100"}`}
            />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState isDark={isDark}>
          No projects yet. Add one — or just tell Boop about it in iMessage and it'll
          appear here.
        </EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {rows.map((p) => (
            <button
              key={p.projectId}
              onClick={() => setEditing(p)}
              className={panelCardClass(isDark, "cursor-pointer p-4 text-left")}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-sm font-semibold">{p.name}</h3>
                    {p.live && (
                      <span className="live-dot inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                    )}
                  </div>
                  {p.aliases.filter((a) => a.toLowerCase() !== p.name.toLowerCase())
                    .length > 0 && (
                    <div className={`mono mt-0.5 truncate text-[10px] ${mutedTextClass(isDark)}`}>
                      aka {p.aliases.filter((a) => a.toLowerCase() !== p.name.toLowerCase()).join(", ")}
                    </div>
                  )}
                </div>
                <StageBadge stage={p.stage} isDark={isDark} />
              </div>
              <p className={`mt-2 line-clamp-2 text-xs ${bodyTextClass(isDark)}`}>
                {p.summary || "No summary yet."}
              </p>
              <div className={`mt-2 flex items-center gap-3 text-[10px] ${mutedTextClass(isDark)}`}>
                {p.version && <span className="mono">{p.version}</span>}
                {p.recentTasks.length > 0 && <span>{p.recentTasks.length} recent</span>}
                {p.lastSyncedAt && (
                  <span>synced {new Date(p.lastSyncedAt).toISOString().slice(0, 10)}</span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {editing && (
        <ProjectModal
          isDark={isDark}
          record={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSync={runSync}
          syncing={syncing}
        />
      )}
    </PanelPage>
  );
}

function StageBadge({ stage, isDark }: { stage: Stage; isDark: boolean }) {
  const c = STAGE_BADGE[stage];
  return (
    <span
      className={`shrink-0 rounded-lg border px-1.5 py-0.5 text-[10px] font-medium capitalize ${
        isDark ? c.dark : c.light
      }`}
    >
      {stage}
    </span>
  );
}

function ProjectModal({
  isDark,
  record,
  onClose,
  onSync,
  syncing,
}: {
  isDark: boolean;
  record: ProjectRecord | null;
  onClose: () => void;
  onSync: (projectId?: string) => void;
  syncing: boolean;
}) {
  const upsert = useMutation(api.projects.upsert);
  const removeProject = useMutation(api.projects.remove);

  const [name, setName] = useState(record?.name ?? "");
  const [summary, setSummary] = useState(record?.summary ?? "");
  const [stage, setStage] = useState<Stage>(record?.stage ?? "idea");
  const [live, setLive] = useState(record?.live ?? false);
  const [liveUrl, setLiveUrl] = useState(record?.liveUrl ?? "");
  const [offerings, setOfferings] = useState((record?.offerings ?? []).join("\n"));
  const [aliases, setAliases] = useState(
    (record?.aliases ?? [])
      .filter((a) => a.toLowerCase() !== (record?.name ?? "").toLowerCase())
      .join(", "),
  );
  const [repoPath, setRepoPath] = useState(record?.repoPath ?? "");
  const [notes, setNotes] = useState(record?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await upsert({
        source: "manual",
        projectId: record?.projectId,
        name: name.trim(),
        summary,
        stage,
        live,
        liveUrl: liveUrl.trim() || null,
        offerings: offerings
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        aliases: aliases
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        repoPath: repoPath.trim() || null,
        notes: notes.trim() || null,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const label = `text-[11px] font-medium uppercase tracking-[0.08em] ${mutedTextClass(isDark)}`;
  const field = `w-full rounded-xl border px-3 py-2 text-sm outline-none ${
    isDark
      ? "border-white/10 bg-white/5 text-zinc-100 focus:border-white/25"
      : "border-zinc-200 bg-white text-zinc-900 focus:border-zinc-400"
  }`;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <div className="modal-backdrop absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        className={`modal-card relative z-10 flex max-h-[85vh] w-full max-w-[560px] flex-col overflow-hidden rounded-2xl border shadow-2xl ${
          isDark ? "border-white/10 bg-[#18181b] text-zinc-100" : "border-zinc-200 bg-white text-zinc-900"
        }`}
        role="dialog"
        aria-modal="true"
      >
        <div
          className={`flex items-center justify-between gap-3 border-b px-5 py-4 ${
            isDark ? "border-white/10" : "border-zinc-200"
          }`}
        >
          <h3 className="text-base font-semibold">
            {record ? record.name : "New project"}
          </h3>
          <div className="flex items-center gap-1.5">
            {record && (
              <button
                onClick={() => onSync(record.projectId)}
                disabled={syncing}
                className={iconBtnClass(isDark)}
                title="Pull fresh context from this repo"
              >
                <HugeiconsIcon
                  icon={ArrowReloadHorizontalIcon}
                  size={15}
                  className={syncing ? "spin-smooth" : ""}
                />
              </button>
            )}
            <button onClick={onClose} aria-label="Close" className={iconBtnClass(isDark)}>
              <HugeiconsIcon icon={Cancel01Icon} size={15} />
            </button>
          </div>
        </div>

        <div className="debug-scroll flex-1 space-y-3.5 overflow-y-auto px-5 py-4">
          <Row label="Name" labelClass={label}>
            <input className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="Sigil" />
          </Row>
          <Row label="Summary" labelClass={label}>
            <input
              className={field}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="One line — what it is."
            />
          </Row>
          <div className="grid grid-cols-2 gap-3">
            <Row label="Stage" labelClass={label}>
              <select
                className={field}
                value={stage}
                onChange={(e) => setStage(e.target.value as Stage)}
              >
                {STAGES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Row>
            <Row label="Live" labelClass={label}>
              <label className={`flex h-[38px] items-center gap-2 text-sm ${bodyTextClass(isDark)}`}>
                <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} />
                In production
              </label>
            </Row>
          </div>
          <Row label="Live URL" labelClass={label}>
            <input
              className={field}
              value={liveUrl}
              onChange={(e) => setLiveUrl(e.target.value)}
              placeholder="https://…"
            />
          </Row>
          <Row label="Offerings (one per line)" labelClass={label}>
            <textarea
              className={`${field} min-h-[64px] resize-y`}
              value={offerings}
              onChange={(e) => setOfferings(e.target.value)}
            />
          </Row>
          <Row label="Aliases (comma-separated)" labelClass={label}>
            <input
              className={field}
              value={aliases}
              onChange={(e) => setAliases(e.target.value)}
              placeholder="other names you call it"
            />
          </Row>
          <Row label="Repo path (on the Mac — enables sync)" labelClass={label}>
            <input
              className={`${field} mono text-xs`}
              value={repoPath}
              onChange={(e) => setRepoPath(e.target.value)}
              placeholder="/Users/you/www/sigil"
            />
          </Row>
          <Row label="Notes" labelClass={label}>
            <textarea
              className={`${field} min-h-[48px] resize-y`}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Row>

          {record && record.recentTasks.length > 0 && (
            <Row label="Recent work (synced from git)" labelClass={label}>
              <ul className={subtlePanelClass(isDark, "space-y-1 px-3 py-2 text-xs")}>
                {record.recentTasks.slice(0, 8).map((t, i) => (
                  <li key={i} className="flex gap-2">
                    <span className={`mono shrink-0 ${mutedTextClass(isDark)}`}>
                      {new Date(t.at).toISOString().slice(0, 10)}
                    </span>
                    <span className={bodyTextClass(isDark)}>{t.summary}</span>
                  </li>
                ))}
              </ul>
            </Row>
          )}
        </div>

        <div
          className={`flex items-center justify-between gap-2 border-t px-5 py-3 ${
            isDark ? "border-white/10" : "border-zinc-200"
          }`}
        >
          {record ? (
            confirmDelete ? (
              <div className="flex items-center gap-2 text-xs">
                <span className={mutedTextClass(isDark)}>Delete?</span>
                <button
                  onClick={async () => {
                    await removeProject({ projectId: record.projectId });
                    onClose();
                  }}
                  className="rounded-lg px-2 py-1 font-medium text-rose-500 hover:bg-rose-500/10"
                >
                  Yes, delete
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className={`rounded-lg px-2 py-1 ${mutedTextClass(isDark)}`}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs ${
                  isDark ? "text-zinc-500 hover:bg-white/5" : "text-zinc-400 hover:bg-zinc-100"
                }`}
              >
                <HugeiconsIcon icon={Delete02Icon} size={13} />
                Delete
              </button>
            )
          ) : (
            <span className={`text-[11px] ${mutedTextClass(isDark)}`}>
              Fields you set here won't be overwritten by sync.
            </span>
          )}
          <div className="flex items-center gap-2">
            {record?.liveUrl && (
              <a
                href={record.liveUrl}
                target="_blank"
                rel="noreferrer"
                className={iconBtnClass(isDark)}
                title="Open live site"
              >
                <HugeiconsIcon icon={Link04Icon} size={15} />
              </a>
            )}
            <button
              onClick={() => void save()}
              disabled={saving || !name.trim()}
              className={primaryBtnClass(isDark) + " disabled:opacity-50"}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Row({
  label,
  labelClass,
  children,
}: {
  label: string;
  labelClass: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className={labelClass}>{label}</div>
      {children}
    </div>
  );
}

function primaryBtnClass(isDark: boolean) {
  return `inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium ${
    isDark ? "bg-zinc-100 text-zinc-950 hover:bg-white" : "bg-zinc-900 text-white hover:bg-zinc-800"
  }`;
}

function syncBtnClass(isDark: boolean) {
  return `inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${
    isDark
      ? "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10"
      : "border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100"
  }`;
}

function iconBtnClass(isDark: boolean) {
  return `inline-flex h-8 w-8 items-center justify-center rounded-xl border disabled:opacity-50 ${
    isDark
      ? "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10"
      : "border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100"
  }`;
}
