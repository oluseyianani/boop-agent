import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api.js";
import { composePrompt } from "../lib/contentPrompts.js";
import { bodyTextClass, mutedTextClass, subtlePanelClass } from "./PanelPrimitives.js";

// Centered-modal detail for one idea: failure moment, hooks, the faceless
// script, UGC brief, composed generation prompts, assets, and competitor
// evidence. Opened from idea rows and calendar slots in ContentPanel.
//
// Rendered through a portal to document.body so it escapes the transformed
// `.view-shell` ancestor — a position:fixed descendant of an element with a
// transform/will-change resolves against that ancestor, not the viewport,
// which previously pinned the panel to the top-left of the content area.

interface IdeaData {
  id: string;
  title: string;
  enemy: string;
  failureMoment?: string;
  angle?: string;
  keywords?: string[];
  formats?: string[];
}

interface ScriptData {
  ideaId: string;
  hooks?: string[];
  beats?: { t?: string; beat: string }[];
  cta?: string;
  ugcBrief?: string;
}

interface CreativePack {
  genPrompts?: { label?: string; prompt?: string }[];
  assets?: string[];
}

interface PostRow {
  ownerHandle: string;
  shortcode: string;
  url?: string;
  caption?: string;
  score: number;
}

export function ContentDetailDrawer({
  isDark,
  projectId,
  projectConfig,
  ideaId,
  ideaRow,
  highlightFormat,
  onClose,
}: {
  isDark: boolean;
  projectId: string;
  projectConfig: Record<string, unknown>;
  ideaId: string;
  ideaRow: { data: string; creative?: string; retired: boolean } | null;
  highlightFormat?: string;
  onClose: () => void;
}) {
  const scripts = useQuery(api.content.listScripts, { projectId }) as
    | { ideaId: string; data: string }[]
    | undefined;
  const competitors = useMemo(
    () =>
      ((projectConfig.competitors as { handle: string }[] | undefined) ?? []).map(
        (c) => c.handle,
      ),
    [projectConfig],
  );
  const competitorPosts = useQuery(api.content.postsForHandles, {
    projectId,
    handles: competitors,
  }) as PostRow[] | undefined;

  const idea: IdeaData | null = useMemo(() => {
    try {
      return ideaRow ? (JSON.parse(ideaRow.data) as IdeaData) : null;
    } catch {
      return null;
    }
  }, [ideaRow]);
  const creative: CreativePack | null = useMemo(() => {
    try {
      return ideaRow?.creative ? (JSON.parse(ideaRow.creative) as CreativePack) : null;
    } catch {
      return null;
    }
  }, [ideaRow]);
  const script: ScriptData | null = useMemo(() => {
    const row = scripts?.find((s) => s.ideaId === ideaId);
    try {
      return row ? (JSON.parse(row.data) as ScriptData) : null;
    } catch {
      return null;
    }
  }, [scripts, ideaId]);

  const evidence = useMemo(() => {
    if (!idea?.keywords?.length || !competitorPosts) return [];
    const kw = idea.keywords.map((k) => k.toLowerCase());
    return competitorPosts
      .filter((p) => kw.some((k) => (p.caption ?? "").toLowerCase().includes(k)))
      .slice(0, 2);
  }, [idea, competitorPosts]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  if (!idea) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <div className="modal-backdrop absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        className={`modal-card relative z-10 flex max-h-[85vh] w-full max-w-[640px] flex-col overflow-hidden rounded-2xl border shadow-2xl ${
          isDark ? "border-white/10 bg-[#18181b] text-zinc-100" : "border-zinc-200 bg-white text-zinc-900"
        }`}
        role="dialog"
        aria-modal="true"
      >
        <div
          className={`flex items-start justify-between gap-3 border-b px-5 py-4 ${
            isDark ? "border-white/10" : "border-zinc-200"
          }`}
        >
          <div className="min-w-0">
            <div className={`text-[11px] uppercase tracking-[0.08em] ${mutedTextClass(isDark)}`}>
              {idea.enemy}
              {ideaRow?.retired ? " · retired" : ""}
            </div>
            <h3 className="mt-0.5 text-base font-semibold leading-snug">{idea.title}</h3>
            <div className={`mono mt-0.5 text-[10px] ${mutedTextClass(isDark)}`}>{ideaId}</div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className={`shrink-0 rounded-lg px-2 py-1 text-sm ${
              isDark ? "text-zinc-400 hover:bg-white/10" : "text-zinc-500 hover:bg-zinc-100"
            }`}
          >
            ×
          </button>
        </div>

        <div className="debug-scroll flex-1 space-y-4 overflow-y-auto px-5 py-4 text-sm">
          <Section title="The failure moment" isDark={isDark}>
            <p className={bodyTextClass(isDark)}>{idea.failureMoment ?? "—"}</p>
            {idea.angle && (
              <p className={`mt-1.5 text-xs ${mutedTextClass(isDark)}`}>
                Execution: {idea.angle}
              </p>
            )}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(idea.formats ?? []).map((f, i) => (
                <span
                  key={f}
                  className={`rounded-lg border px-1.5 py-0.5 text-[10px] ${
                    f === highlightFormat
                      ? isDark
                        ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                        : "border-emerald-300 bg-emerald-50 text-emerald-700"
                      : isDark
                        ? "border-white/10 text-zinc-400"
                        : "border-zinc-200 text-zinc-500"
                  }`}
                >
                  {f}
                  {i === 0 ? " · lead" : ""}
                </span>
              ))}
            </div>
          </Section>

          {script ? (
            <>
              <Section title="Hooks" isDark={isDark}>
                <ol className="space-y-1.5">
                  {(script.hooks ?? []).map((h, i) => (
                    <li key={i} className={subtlePanelClass(isDark, "px-3 py-2")}>
                      <span className={`mono mr-2 text-[10px] ${mutedTextClass(isDark)}`}>
                        {"ABC"[i] ?? i}
                      </span>
                      <span className={bodyTextClass(isDark)}>{h}</span>
                    </li>
                  ))}
                </ol>
              </Section>

              <Section title="Script (faceless)" isDark={isDark}>
                <div className="space-y-1.5">
                  {(script.beats ?? []).map((b, i) => (
                    <div key={i} className="flex gap-2.5">
                      <span className={`mono shrink-0 text-[10px] leading-5 ${mutedTextClass(isDark)}`}>
                        {b.t ?? "•"}
                      </span>
                      <span className={bodyTextClass(isDark)}>{b.beat}</span>
                    </div>
                  ))}
                </div>
                {script.cta && (
                  <div className={subtlePanelClass(isDark, "mt-2 px-3 py-2")}>
                    <span className={`mr-2 text-[10px] uppercase ${mutedTextClass(isDark)}`}>CTA</span>
                    <span className={bodyTextClass(isDark)}>{script.cta}</span>
                  </div>
                )}
              </Section>

              {script.ugcBrief && (
                <Section
                  title="UGC brief"
                  isDark={isDark}
                  action={<CopyButton text={script.ugcBrief} isDark={isDark} />}
                >
                  <p className={`whitespace-pre-wrap ${bodyTextClass(isDark)}`}>{script.ugcBrief}</p>
                </Section>
              )}
            </>
          ) : (
            <Section title="Script" isDark={isDark}>
              <p className={mutedTextClass(isDark)}>
                Not scripted yet — the weekly refresh writes scripts for up to 2 unscripted ideas
                per run.
              </p>
            </Section>
          )}

          {(creative?.genPrompts ?? []).length > 0 && (
            <Section title="Generation prompts (composed, copy-paste ready)" isDark={isDark}>
              <div className="space-y-2">
                {creative!.genPrompts!.map((g, i) => {
                  const composed = composePrompt(projectConfig, idea, script, g);
                  return (
                    <div key={i} className={subtlePanelClass(isDark, "p-3")}>
                      <div className="mb-1.5 flex items-center justify-between gap-2">
                        <span className={`text-xs font-medium ${bodyTextClass(isDark)}`}>
                          {g.label ?? `prompt ${i + 1}`}
                        </span>
                        <CopyButton text={composed} isDark={isDark} />
                      </div>
                      <pre
                        className={`max-h-40 overflow-y-auto whitespace-pre-wrap text-[11px] leading-relaxed ${mutedTextClass(isDark)}`}
                      >
                        {composed}
                      </pre>
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          {(creative?.assets ?? []).length > 0 && (
            <Section title="Assets to capture" isDark={isDark}>
              <ul className={`list-inside list-disc space-y-1 ${bodyTextClass(isDark)}`}>
                {creative!.assets!.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </Section>
          )}

          {evidence.length > 0 && (
            <Section title="Evidence (competitor posts on this theme)" isDark={isDark}>
              <div className="space-y-1.5">
                {evidence.map((p) => (
                  <a
                    key={p.shortcode}
                    href={p.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={subtlePanelClass(
                      isDark,
                      "block px-3 py-2 hover:opacity-80",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="mono">@{p.ownerHandle}</span>
                      <span className={mutedTextClass(isDark)}>score {p.score.toLocaleString("en-GB")}</span>
                    </div>
                    <div className={`mt-0.5 text-[11px] ${mutedTextClass(isDark)}`}>
                      {[...String(p.caption ?? "")].slice(0, 110).join("")}…
                    </div>
                  </a>
                ))}
              </div>
            </Section>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Section({
  title,
  isDark,
  action,
  children,
}: {
  title: string;
  isDark: boolean;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <h4 className={`text-[11px] font-medium uppercase tracking-[0.08em] ${mutedTextClass(isDark)}`}>
          {title}
        </h4>
        {action}
      </div>
      {children}
    </section>
  );
}

function CopyButton({ text, isDark }: { text: string; isDark: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className={`shrink-0 rounded-lg border px-2 py-0.5 text-[10px] font-medium ${
        isDark
          ? "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10"
          : "border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100"
      }`}
    >
      {copied ? "copied" : "copy"}
    </button>
  );
}
