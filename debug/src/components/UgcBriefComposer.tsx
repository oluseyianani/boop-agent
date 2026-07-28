import { useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api.js";
import {
  composeUgcPrompt,
  isBriefRenderable,
  type CreativePack,
  type UgcBrief,
} from "../lib/contentPrompts.js";
import { ViralTeardownModal } from "./ViralTeardownModal.js";
import { bodyTextClass, mutedTextClass, subtlePanelClass } from "./PanelPrimitives.js";

interface IdeaContext {
  title?: string;
  enemy?: string;
  failureMoment?: string;
  angle?: string;
}

interface DraftBrief {
  label?: string;
  voiceover?: string;
  mood?: string;
  scene?: string;
  actorBlocking?: string;
  camera?: string;
  appMoment?: string;
}

// Composer for an idea's UGC briefs. Rigid fields (scene / actor / camera /
// app moment / voiceover / mood) + a reference-clip picker, with a live
// Seedance-ready prompt preview. Persists the whole ugcBriefs array into the
// idea's creative blob (assets preserved).

interface ClipOption {
  clipId: string;
  label: string;
  tag: string;
}

const MOODS = ["neutral", "excited", "calm", "frustrated", "relieved", "playful"];

function newBrief(): UgcBrief {
  return {
    id: `brief-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    referenceClips: [],
    voiceover: "",
    mood: "neutral",
    scene: "",
    actorBlocking: "",
    camera: "",
    appMoment: "",
  };
}

export function UgcBriefComposer({
  isDark,
  projectId,
  ideaId,
  creative,
  clips,
  product,
  idea,
}: {
  isDark: boolean;
  projectId: string;
  ideaId: string;
  creative: CreativePack | null;
  clips: ClipOption[];
  product?: string;
  idea?: IdeaContext;
}) {
  const setIdeaCreative = useMutation(api.content.setIdeaCreative);
  const [briefs, setBriefs] = useState<UgcBrief[]>(() => creative?.ugcBriefs ?? []);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [teardownOpen, setTeardownOpen] = useState(false);

  function addFromDraft(draft: DraftBrief, refId: string) {
    setBriefs((prev) => [
      ...prev,
      {
        ...newBrief(),
        label: draft.label,
        viralReferenceId: refId,
        voiceover: draft.voiceover ?? "",
        mood: draft.mood ?? "neutral",
        scene: draft.scene ?? "",
        actorBlocking: draft.actorBlocking ?? "",
        camera: draft.camera ?? "",
        appMoment: draft.appMoment ?? "",
      },
    ]);
  }

  const initial = useMemo(() => JSON.stringify(creative?.ugcBriefs ?? []), [creative]);
  const dirty = JSON.stringify(briefs) !== initial;

  function update(id: string, patch: Partial<UgcBrief>) {
    setBriefs((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }

  async function save() {
    setSaving(true);
    try {
      const next: CreativePack = { ...(creative ?? {}), ugcBriefs: briefs };
      delete (next as { genPrompts?: unknown }).genPrompts; // retire the faceless format
      await setIdeaCreative({ projectId, ideaId, creative: JSON.stringify(next) });
      setSavedAt(Date.now());
    } finally {
      setSaving(false);
    }
  }

  return (
    <section>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <h4 className={`text-[11px] font-medium uppercase tracking-[0.08em] ${mutedTextClass(isDark)}`}>
          UGC briefs (Seedance)
        </h4>
        <div className="flex items-center gap-2">
          {dirty && <span className="text-[10px] text-amber-400">unsaved</span>}
          {!dirty && savedAt && <span className="text-[10px] text-emerald-500">saved</span>}
          <button
            type="button"
            disabled={!dirty || saving}
            onClick={save}
            className={`rounded-lg border px-2 py-0.5 text-[10px] font-medium disabled:opacity-40 ${
              isDark
                ? "border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10"
                : "border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-zinc-100"
            }`}
          >
            {saving ? "saving…" : "Save"}
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {briefs.length === 0 && (
          <p className={`text-xs ${mutedTextClass(isDark)}`}>
            No briefs yet. Add one, describe the scene, and copy the Seedance-ready prompt.
          </p>
        )}

        {briefs.map((brief, idx) => (
          <BriefCard
            key={brief.id}
            isDark={isDark}
            brief={brief}
            index={idx}
            clips={clips}
            onChange={(patch) => update(brief.id, patch)}
            onRemove={() => setBriefs((prev) => prev.filter((b) => b.id !== brief.id))}
          />
        ))}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setBriefs((prev) => [...prev, newBrief()])}
            className={`flex-1 rounded-lg border border-dashed py-2 text-xs font-medium ${
              isDark
                ? "border-white/15 text-zinc-400 hover:bg-white/5"
                : "border-zinc-300 text-zinc-500 hover:bg-zinc-50"
            }`}
          >
            + Add brief
          </button>
          <button
            type="button"
            onClick={() => setTeardownOpen(true)}
            className={`flex-1 rounded-lg border py-2 text-xs font-medium ${
              isDark
                ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300 hover:bg-emerald-400/20"
                : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
            }`}
          >
            ✨ Draft from viral video
          </button>
        </div>
      </div>

      {teardownOpen && (
        <ViralTeardownModal
          isDark={isDark}
          projectId={projectId}
          product={product}
          idea={idea}
          onClose={() => setTeardownOpen(false)}
          onUse={addFromDraft}
        />
      )}
    </section>
  );
}

function BriefCard({
  isDark,
  brief,
  index,
  clips,
  onChange,
  onRemove,
}: {
  isDark: boolean;
  brief: UgcBrief;
  index: number;
  clips: ClipOption[];
  onChange: (patch: Partial<UgcBrief>) => void;
  onRemove: () => void;
}) {
  const selected = brief.referenceClips ?? [];
  const prompt = composeUgcPrompt(brief);
  const clipLabel = (id: string) => clips.find((c) => c.clipId === id)?.label ?? id;

  function toggleClip(clipId: string) {
    onChange({
      referenceClips: selected.includes(clipId)
        ? selected.filter((c) => c !== clipId)
        : [...selected, clipId],
    });
  }

  return (
    <div className={subtlePanelClass(isDark, "space-y-2.5 p-3")}>
      <div className="flex items-center justify-between gap-2">
        <input
          value={brief.label ?? ""}
          onChange={(e) => onChange({ label: e.target.value })}
          placeholder={`brief ${index + 1} — short name`}
          className={`min-w-0 flex-1 bg-transparent text-xs font-medium outline-none ${bodyTextClass(isDark)} placeholder:font-normal ${
            isDark ? "placeholder:text-zinc-600" : "placeholder:text-zinc-400"
          }`}
        />
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove brief"
          className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] ${
            isDark ? "text-zinc-500 hover:bg-white/10" : "text-zinc-400 hover:bg-zinc-100"
          }`}
        >
          ×
        </button>
      </div>

      {/* Reference clips → [Video1], [Video2]… in selection order */}
      <Field label="Reference clips" isDark={isDark}>
        {clips.length === 0 ? (
          <p className={`text-[11px] ${mutedTextClass(isDark)}`}>
            Upload clips in the Reference clips library to anchor a brief.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {clips.map((clip) => {
              const pos = selected.indexOf(clip.clipId);
              const on = pos >= 0;
              return (
                <button
                  key={clip.clipId}
                  type="button"
                  onClick={() => toggleClip(clip.clipId)}
                  className={`rounded-lg border px-2 py-1 text-[10px] font-medium ${
                    on
                      ? isDark
                        ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                        : "border-emerald-300 bg-emerald-50 text-emerald-700"
                      : isDark
                        ? "border-white/10 text-zinc-400 hover:bg-white/5"
                        : "border-zinc-200 text-zinc-500 hover:bg-zinc-50"
                  }`}
                >
                  {on ? `[Video${pos + 1}] ` : ""}
                  {clip.label}
                </button>
              );
            })}
          </div>
        )}
      </Field>

      <Field label="Voiceover (verbatim)" isDark={isDark}>
        <textarea
          value={brief.voiceover ?? ""}
          onChange={(e) => onChange({ voiceover: e.target.value })}
          rows={2}
          placeholder="I can't believe I didn't know about this app sooner…"
          className={inputClass(isDark)}
        />
      </Field>

      <Field label="Mood" isDark={isDark}>
        <div className="flex flex-wrap gap-1.5">
          {MOODS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onChange({ mood: m })}
              className={`rounded-lg border px-2 py-0.5 text-[10px] ${
                brief.mood === m
                  ? isDark
                    ? "border-white/25 bg-white/10 text-zinc-100"
                    : "border-zinc-400 bg-zinc-100 text-zinc-800"
                  : isDark
                    ? "border-white/10 text-zinc-400 hover:bg-white/5"
                    : "border-zinc-200 text-zinc-500 hover:bg-zinc-50"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Scene / setting" isDark={isDark}>
        <input
          value={brief.scene ?? ""}
          onChange={(e) => onChange({ scene: e.target.value })}
          placeholder="her bedroom, soft afternoon light"
          className={inputClass(isDark)}
        />
      </Field>

      <Field label="Actor blocking" isDark={isDark}>
        <input
          value={brief.actorBlocking ?? ""}
          onChange={(e) => onChange({ actorBlocking: e.target.value })}
          placeholder="sitting on her bed, scrolling her phone"
          className={inputClass(isDark)}
        />
      </Field>

      <Field label="Camera" isDark={isDark}>
        <input
          value={brief.camera ?? ""}
          onChange={(e) => onChange({ camera: e.target.value })}
          placeholder="opens on her face, hard cut to over-the-shoulder"
          className={inputClass(isDark)}
        />
      </Field>

      <Field label="App moment" isDark={isDark}>
        <input
          value={brief.appMoment ?? ""}
          onChange={(e) => onChange({ appMoment: e.target.value })}
          placeholder="[Video1] showing on her phone as she taps through"
          className={inputClass(isDark)}
        />
      </Field>

      {/* Live Seedance-ready prompt */}
      <div className={`rounded-lg border ${isDark ? "border-white/10 bg-black/20" : "border-zinc-200 bg-zinc-50"} p-2.5`}>
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className={`text-[10px] uppercase tracking-[0.08em] ${mutedTextClass(isDark)}`}>
            Seedance prompt
          </span>
          <CopyButton text={prompt} isDark={isDark} disabled={!isBriefRenderable(brief)} />
        </div>
        <pre className={`whitespace-pre-wrap text-[11px] leading-relaxed ${bodyTextClass(isDark)}`}>
          {prompt}
        </pre>
        {selected.length > 0 && (
          <div className={`mt-1.5 border-t pt-1.5 text-[10px] ${isDark ? "border-white/10" : "border-zinc-200"} ${mutedTextClass(isDark)}`}>
            {selected.map((id, i) => (
              <div key={id}>
                <span className="mono">[Video{i + 1}]</span> = {clipLabel(id)}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  isDark,
  children,
}: {
  label: string;
  isDark: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className={`mb-1 block text-[10px] uppercase tracking-[0.08em] ${mutedTextClass(isDark)}`}>
        {label}
      </span>
      {children}
    </label>
  );
}

function inputClass(isDark: boolean): string {
  return `w-full resize-y rounded-lg border px-2 py-1.5 text-xs outline-none ${
    isDark
      ? "border-white/10 bg-white/5 text-zinc-100 placeholder:text-zinc-600"
      : "border-zinc-200 bg-white text-zinc-900 placeholder:text-zinc-400"
  }`;
}

function CopyButton({
  text,
  isDark,
  disabled,
}: {
  text: string;
  isDark: boolean;
  disabled?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className={`shrink-0 rounded-lg border px-2 py-0.5 text-[10px] font-medium disabled:opacity-40 ${
        isDark
          ? "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10"
          : "border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100"
      }`}
    >
      {copied ? "copied" : "copy"}
    </button>
  );
}
