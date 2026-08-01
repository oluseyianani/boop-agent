import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api.js";
import { bodyTextClass, mutedTextClass, subtlePanelClass } from "./PanelPrimitives.js";

// Content idea generator (content desk — top of the funnel). Generate a batch of
// INFORMATIVE, standalone ideas (nutrition, grocery-item-of-the-week, recipes…),
// review them, uncheck the duds, and keep the rest into the idea bank. The video
// teaches; the app is named only in the caption CTA. No enemy — pure topic.

export interface GeneratedIdea {
  title: string;
  topic: string;
  hook: string;
  angle: string;
  keyPoints: string[];
  payoff: string;
  caption: string;
  formats: string[];
  keywords: string[];
}

// The `data` blob written to contentIdeas for a generated idea. `source` +
// `kind` tag it so the bank can show a "generated" pill and offer delete, and
// enemy is empty by design (pure-topic content).
interface GeneratedIdeaData extends GeneratedIdea {
  id: string;
  enemy: "";
  retired: false;
  source: "generated";
  kind: "informative";
  createdAt: number;
}

export function ContentIdeaGenerator({
  isDark,
  projectId,
  product,
  existingTitles,
  onClose,
}: {
  isDark: boolean;
  projectId: string;
  product?: string;
  existingTitles: string[];
  onClose: () => void;
}) {
  const upsertIdea = useMutation(api.content.upsertIdea);

  const [count, setCount] = useState(5);
  const [topics, setTopics] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ideas, setIdeas] = useState<GeneratedIdea[] | null>(null);
  const [keep, setKeep] = useState<Set<number>>(new Set());

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function generate() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/content/ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product,
          count,
          topics: topics.trim() || undefined,
          avoidTitles: existingTitles,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `generation failed (${res.status})`);
      }
      const parsed = (await res.json()) as { ideas: GeneratedIdea[] };
      setIdeas(parsed.ideas);
      setKeep(new Set(parsed.ideas.map((_, i) => i))); // all checked by default
    } catch (e) {
      setError(e instanceof Error ? e.message : "generation failed");
    } finally {
      setBusy(false);
    }
  }

  function toggle(i: number) {
    setKeep((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  async function saveKept() {
    if (!ideas) return;
    setSaving(true);
    setError(null);
    try {
      const stamp = Date.now().toString(36);
      let n = 0;
      for (let i = 0; i < ideas.length; i++) {
        if (!keep.has(i)) continue;
        const idea = ideas[i];
        const id = `gen-${stamp}-${i}`;
        const data: GeneratedIdeaData = {
          ...idea,
          id,
          enemy: "",
          retired: false,
          source: "generated",
          kind: "informative",
          createdAt: Date.now(),
        };
        await upsertIdea({
          projectId,
          ideaId: id,
          title: idea.title,
          enemy: "",
          retired: false,
          data: JSON.stringify(data),
        });
        n++;
      }
      if (n === 0) {
        setError("Nothing selected to keep.");
        setSaving(false);
        return;
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "save failed");
      setSaving(false);
    }
  }

  const keptCount = keep.size;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6">
      <div className="modal-backdrop absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        className={`modal-card relative z-10 flex max-h-[88vh] w-full max-w-[620px] flex-col overflow-hidden rounded-2xl border shadow-2xl ${
          isDark ? "border-white/10 bg-[#18181b] text-zinc-100" : "border-zinc-200 bg-white text-zinc-900"
        }`}
        role="dialog"
        aria-modal="true"
      >
        <div className={`flex items-start justify-between gap-3 border-b px-5 py-4 ${isDark ? "border-white/10" : "border-zinc-200"}`}>
          <div className="min-w-0">
            <div className={`text-[11px] uppercase tracking-[0.08em] ${mutedTextClass(isDark)}`}>Idea generator</div>
            <h3 className="mt-0.5 text-base font-semibold leading-snug">
              {ideas ? "Review ideas" : "Generate content ideas"}
            </h3>
          </div>
          <button onClick={onClose} aria-label="Close" className={`shrink-0 rounded-lg px-2 py-1 text-sm ${isDark ? "text-zinc-400 hover:bg-white/10" : "text-zinc-500 hover:bg-zinc-100"}`}>×</button>
        </div>

        <div className="debug-scroll flex-1 space-y-3 overflow-y-auto px-5 py-4 text-sm">
          {ideas ? (
            <>
              <p className={`text-xs ${mutedTextClass(isDark)}`}>
                {ideas.length} ideas. Uncheck any you don't want, then keep the rest into the bank.
              </p>
              {ideas.map((idea, i) => (
                <IdeaCard
                  key={i}
                  idea={idea}
                  isDark={isDark}
                  checked={keep.has(i)}
                  onToggle={() => toggle(i)}
                />
              ))}
              {error ? <p className="text-xs text-rose-400">{error}</p> : null}
            </>
          ) : (
            <>
              <p className={`text-xs ${mutedTextClass(isDark)}`}>
                Informative ideas the video teaches on its own (nutrition, grocery-item-of-the-week,
                recipes, food storage…). The app is named only in the caption CTA — never on camera.
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <Field label="How many" isDark={isDark}>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={count}
                    onChange={(e) => setCount(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                    className={`w-20 ${inputClass(isDark)}`}
                  />
                </Field>
                <div className="flex flex-wrap gap-1.5 pb-0.5">
                  {[5, 10, 15].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setCount(n)}
                      className={`rounded-lg border px-2 py-1 text-[11px] font-medium ${
                        count === n
                          ? isDark ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" : "border-emerald-300 bg-emerald-50 text-emerald-700"
                          : isDark ? "border-white/10 text-zinc-400 hover:bg-white/5" : "border-zinc-200 text-zinc-500 hover:bg-zinc-50"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <Field label="Steer the topics (optional)" isDark={isDark}>
                <textarea
                  value={topics}
                  onChange={(e) => setTopics(e.target.value)}
                  rows={2}
                  placeholder="e.g. winter produce, high-protein swaps, reducing food waste"
                  className={inputClass(isDark)}
                />
              </Field>
              {error ? <p className="text-xs text-rose-400">{error}</p> : null}
            </>
          )}
        </div>

        <div className={`flex items-center justify-end gap-2 border-t px-5 py-3 ${isDark ? "border-white/10" : "border-zinc-200"}`}>
          {ideas ? (
            <>
              <button onClick={() => setIdeas(null)} disabled={saving} className={ghostBtn(isDark)}>Back</button>
              <button onClick={saveKept} disabled={saving || keptCount === 0} className={primaryBtn(isDark)}>
                {saving ? "saving…" : `Keep ${keptCount} to bank`}
              </button>
            </>
          ) : (
            <>
              <button onClick={onClose} className={ghostBtn(isDark)}>Cancel</button>
              <button onClick={generate} disabled={busy} className={primaryBtn(isDark)}>
                {busy ? "writing…" : `Generate ${count}`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function IdeaCard({
  idea,
  isDark,
  checked,
  onToggle,
}: {
  idea: GeneratedIdea;
  isDark: boolean;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <div className={subtlePanelClass(isDark, `p-3 ${checked ? "" : "opacity-45"}`)}>
      <label className="flex items-start gap-2.5">
        <input type="checkbox" checked={checked} onChange={onToggle} className="mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`font-medium ${bodyTextClass(isDark)}`}>{idea.title}</span>
            <Tag isDark={isDark}>{idea.topic}</Tag>
          </div>
          <p className={`mt-1 text-xs ${bodyTextClass(isDark)}`}>“{idea.hook}”</p>
          {idea.keyPoints.length > 0 ? (
            <ul className={`mt-1 list-disc space-y-0.5 pl-4 text-[11px] ${mutedTextClass(isDark)}`}>
              {idea.keyPoints.map((p, j) => (
                <li key={j}>{p}</li>
              ))}
            </ul>
          ) : null}
          {idea.payoff ? (
            <p className={`mt-1 text-[11px] ${mutedTextClass(isDark)}`}>takeaway: {idea.payoff}</p>
          ) : null}
          {idea.caption ? (
            <p className={`mt-1 text-[11px] italic ${mutedTextClass(isDark)}`}>caption: {idea.caption}</p>
          ) : null}
        </div>
      </label>
    </div>
  );
}

function Tag({ isDark, children }: { isDark: boolean; children: React.ReactNode }) {
  return (
    <span className={`rounded-md border px-1.5 py-0.5 text-[10px] ${isDark ? "border-white/10 text-zinc-400" : "border-zinc-200 text-zinc-500"}`}>{children}</span>
  );
}

function Field({ label, isDark, children }: { label: string; isDark: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className={`mb-1 block text-[10px] uppercase tracking-[0.08em] ${mutedTextClass(isDark)}`}>{label}</span>
      {children}
    </label>
  );
}

function inputClass(isDark: boolean): string {
  return `w-full resize-y rounded-lg border px-2 py-1.5 text-xs outline-none ${isDark ? "border-white/10 bg-white/5 text-zinc-100 placeholder:text-zinc-600" : "border-zinc-200 bg-white text-zinc-900 placeholder:text-zinc-400"}`;
}
function ghostBtn(isDark: boolean): string {
  return `rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-40 ${isDark ? "border-white/10 text-zinc-300 hover:bg-white/10" : "border-zinc-200 text-zinc-600 hover:bg-zinc-100"}`;
}
function primaryBtn(isDark: boolean): string {
  return `rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-40 ${isDark ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300 hover:bg-emerald-400/20" : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"}`;
}
