import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api.js";
import type { Id } from "../../../convex/_generated/dataModel";
import { extractFrames } from "../lib/videoFrames.js";
import { bodyTextClass, mutedTextClass, subtlePanelClass } from "./PanelPrimitives.js";

// Feed a viral niche video → analyse why it works → draft a UGC brief in the
// Seedance style, adapted to this idea. Uploading the video extracts a few
// frames (client-side) for real multimodal analysis; otherwise it works from
// the URL / caption / your beat-by-beat notes.

interface DraftBrief {
  label?: string;
  voiceover?: string;
  mood?: string;
  scene?: string;
  actorBlocking?: string;
  camera?: string;
  appMoment?: string;
}

interface Teardown {
  hook: string;
  whyItWorks: string[];
  structure: { t?: string; beat: string }[];
  voiceoverStyle: string;
  mood: string;
  pacing: string;
  format: string;
}

interface TeardownResult {
  teardown: Teardown | null;
  draftBrief: DraftBrief;
}

const PLATFORMS = ["tiktok", "instagram", "youtube", "other"];

export function ViralTeardownModal({
  isDark,
  projectId,
  product,
  idea,
  onClose,
  onUse,
}: {
  isDark: boolean;
  projectId: string;
  product?: string;
  idea?: { title?: string; enemy?: string; failureMoment?: string; angle?: string };
  onClose: () => void;
  onUse: (draft: DraftBrief, refId: string) => void;
}) {
  const generateUploadUrl = useMutation(api.content.generateClipUploadUrl);
  const saveRef = useMutation(api.content.saveViralReference);

  const fileRef = useRef<HTMLInputElement>(null);
  const [platform, setPlatform] = useState("tiktok");
  const [url, setUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [notes, setNotes] = useState("");
  const [phase, setPhase] = useState<"idle" | "frames" | "analyzing">("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ res: TeardownResult; refId: string } | null>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function uploadFrame(blob: Blob): Promise<string> {
    const uploadUrl = await generateUploadUrl();
    const res = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": "image/jpeg" },
      body: blob,
    });
    if (!res.ok) throw new Error(`frame upload failed (${res.status})`);
    const { storageId } = (await res.json()) as { storageId: string };
    return storageId;
  }

  async function analyze() {
    setError(null);
    setResult(null);
    try {
      let frameStorageIds: string[] | undefined;
      const file = fileRef.current?.files?.[0];
      if (file) {
        setPhase("frames");
        const frames = await extractFrames(file, 4);
        frameStorageIds = await Promise.all(frames.map(uploadFrame));
      }
      setPhase("analyzing");
      const res = await fetch("/api/content/teardown", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product,
          idea,
          platform,
          url: url.trim() || undefined,
          caption: caption.trim() || undefined,
          notes: notes.trim() || undefined,
          frameStorageIds,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `teardown failed (${res.status})`);
      }
      const parsed = (await res.json()) as TeardownResult;
      const refId = `viral-${Date.now().toString(36)}`;
      await saveRef({
        projectId,
        refId,
        platform,
        url: url.trim() || undefined,
        caption: caption.trim() || undefined,
        notes: notes.trim() || undefined,
        teardown: JSON.stringify(parsed.teardown ?? null),
        status: "done",
      });
      setResult({ res: parsed, refId });
    } catch (e) {
      setError(e instanceof Error ? e.message : "analysis failed");
    } finally {
      setPhase("idle");
    }
  }

  const busy = phase !== "idle";
  const teardown = result?.res.teardown;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6">
      <div className="modal-backdrop absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        className={`modal-card relative z-10 flex max-h-[88vh] w-full max-w-[560px] flex-col overflow-hidden rounded-2xl border shadow-2xl ${
          isDark ? "border-white/10 bg-[#18181b] text-zinc-100" : "border-zinc-200 bg-white text-zinc-900"
        }`}
        role="dialog"
        aria-modal="true"
      >
        <div className={`flex items-start justify-between gap-3 border-b px-5 py-4 ${isDark ? "border-white/10" : "border-zinc-200"}`}>
          <div className="min-w-0">
            <div className={`text-[11px] uppercase tracking-[0.08em] ${mutedTextClass(isDark)}`}>
              Viral teardown
            </div>
            <h3 className="mt-0.5 text-base font-semibold leading-snug">Replicate what's working</h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className={`shrink-0 rounded-lg px-2 py-1 text-sm ${isDark ? "text-zinc-400 hover:bg-white/10" : "text-zinc-500 hover:bg-zinc-100"}`}
          >
            ×
          </button>
        </div>

        <div className="debug-scroll flex-1 space-y-3 overflow-y-auto px-5 py-4 text-sm">
          {!result && (
            <>
              <p className={`text-xs ${mutedTextClass(isDark)}`}>
                Feed a niche video that's performing well. Upload it for frame-level analysis, or
                just paste the link and describe what happens.
              </p>
              <div className="flex gap-2">
                <label className="flex flex-col gap-1">
                  <span className={`text-[10px] uppercase tracking-[0.08em] ${mutedTextClass(isDark)}`}>Platform</span>
                  <select
                    value={platform}
                    onChange={(e) => setPlatform(e.target.value)}
                    className={selectClass(isDark)}
                  >
                    {PLATFORMS.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-1 flex-col gap-1">
                  <span className={`text-[10px] uppercase tracking-[0.08em] ${mutedTextClass(isDark)}`}>URL</span>
                  <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" className={inputClass(isDark)} />
                </label>
              </div>
              <Field label="Caption" isDark={isDark}>
                <input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="the post's caption" className={inputClass(isDark)} />
              </Field>
              <Field label="What happens (beat by beat)" isDark={isDark}>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="opens on her face, cuts to phone, …" className={inputClass(isDark)} />
              </Field>
              <Field label="Video file (optional — enables frame analysis)" isDark={isDark}>
                <input ref={fileRef} type="file" accept="video/*" className={`text-xs ${bodyTextClass(isDark)} file:mr-2 file:rounded-lg file:border-0 file:bg-zinc-200 file:px-2 file:py-1 file:text-xs file:text-zinc-800`} />
              </Field>
              {error && <p className="text-xs text-rose-400">{error}</p>}
            </>
          )}

          {result && (
            <>
              {teardown ? (
                <div className={subtlePanelClass(isDark, "space-y-2 p-3")}>
                  <div className={`text-[10px] uppercase tracking-[0.08em] ${mutedTextClass(isDark)}`}>Why it works</div>
                  <div className={`text-xs font-medium ${bodyTextClass(isDark)}`}>Hook: {teardown.hook}</div>
                  <ul className={`list-inside list-disc text-[11px] ${mutedTextClass(isDark)}`}>
                    {teardown.whyItWorks.map((r, i) => <li key={i}>{r}</li>)}
                  </ul>
                  <div className={`text-[11px] ${mutedTextClass(isDark)}`}>
                    {teardown.format} · {teardown.pacing} · VO: {teardown.voiceoverStyle}
                  </div>
                </div>
              ) : (
                <p className={`text-xs ${mutedTextClass(isDark)}`}>Original brief (no reference).</p>
              )}

              <div className={subtlePanelClass(isDark, "space-y-1.5 p-3")}>
                <div className={`text-[10px] uppercase tracking-[0.08em] ${mutedTextClass(isDark)}`}>Drafted brief</div>
                {(
                  [
                    ["voiceover", result.res.draftBrief.voiceover],
                    ["mood", result.res.draftBrief.mood],
                    ["scene", result.res.draftBrief.scene],
                    ["actor", result.res.draftBrief.actorBlocking],
                    ["camera", result.res.draftBrief.camera],
                    ["app moment", result.res.draftBrief.appMoment],
                  ] as const
                ).map(([k, val]) =>
                  val ? (
                    <div key={k} className={`text-xs ${bodyTextClass(isDark)}`}>
                      <span className={mutedTextClass(isDark)}>{k}: </span>
                      {val}
                    </div>
                  ) : null,
                )}
              </div>
            </>
          )}
        </div>

        <div className={`flex items-center justify-end gap-2 border-t px-5 py-3 ${isDark ? "border-white/10" : "border-zinc-200"}`}>
          {result ? (
            <>
              <button onClick={() => setResult(null)} className={ghostBtn(isDark)}>Back</button>
              <button
                onClick={() => {
                  onUse(result.res.draftBrief, result.refId);
                  onClose();
                }}
                className={primaryBtn(isDark)}
              >
                Use as brief
              </button>
            </>
          ) : (
            <>
              <button onClick={onClose} className={ghostBtn(isDark)}>Cancel</button>
              <button onClick={analyze} disabled={busy} className={primaryBtn(isDark)}>
                {phase === "frames" ? "reading frames…" : phase === "analyzing" ? "analyzing…" : "Analyze"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
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
  return `w-full resize-y rounded-lg border px-2 py-1.5 text-xs outline-none ${
    isDark ? "border-white/10 bg-white/5 text-zinc-100 placeholder:text-zinc-600" : "border-zinc-200 bg-white text-zinc-900 placeholder:text-zinc-400"
  }`;
}
function selectClass(isDark: boolean): string {
  return `rounded-lg border px-2 py-1.5 text-xs ${isDark ? "border-white/10 bg-white/5 text-zinc-200" : "border-zinc-200 bg-white text-zinc-700"}`;
}
function ghostBtn(isDark: boolean): string {
  return `rounded-lg border px-3 py-1.5 text-xs font-medium ${isDark ? "border-white/10 text-zinc-300 hover:bg-white/10" : "border-zinc-200 text-zinc-600 hover:bg-zinc-100"}`;
}
function primaryBtn(isDark: boolean): string {
  return `rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-40 ${
    isDark ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300 hover:bg-emerald-400/20" : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
  }`;
}
