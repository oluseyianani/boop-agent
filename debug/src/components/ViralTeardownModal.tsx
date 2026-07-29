import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api.js";
import type { Id } from "../../../convex/_generated/dataModel";
import type { UgcBrief } from "../lib/contentPrompts.js";
import { extractFrames } from "../lib/videoFrames.js";
import { bodyTextClass, mutedTextClass, subtlePanelClass } from "./PanelPrimitives.js";

// Generate a framework-compliant UGC ad, optionally from a viral reference.
// Pick a format, optionally feed a viral video (upload → client-side frames for
// multimodal analysis, or URL/caption/notes), then "Use" the ad to drop a brief
// into the composer.

interface AdScene {
  beat: string;
  voiceover: string;
  seconds?: string;
  assetIncluded: boolean;
  asset?: string;
  direction: string;
  continuity?: string;
}
interface Ad {
  format: string;
  variationType?: string;
  enemy?: string;
  hook?: string;
  analogy?: string;
  script?: string;
  scenes: AdScene[];
  avatarPrompt?: string;
  caption?: string;
  cta?: string;
}
interface Teardown {
  hook: string;
  whyItWorks: string[];
  format: string;
  pacing: string;
  voiceoverStyle: string;
}
interface Result {
  teardown: Teardown | null;
  ad: Ad;
}

const PLATFORMS = ["tiktok", "instagram", "youtube", "other"];
const FORMATS = [
  { id: "mid_funnel", label: "Mid-Funnel Punchy" },
  { id: "full_stack", label: "Full Stack" },
  { id: "animated_infomercial", label: "Animated" },
];

function adToBrief(ad: Ad, refId: string): Partial<UgcBrief> {
  const firstAsset = ad.scenes.find((s) => s.assetIncluded && s.asset);
  return {
    label: ad.enemy || ad.format,
    viralReferenceId: refId,
    format: ad.format,
    hook: ad.hook,
    analogy: ad.analogy,
    scenes: ad.scenes,
    avatarPrompt: ad.avatarPrompt,
    caption: ad.caption,
    voiceover: ad.script,
    appMoment: firstAsset ? `${firstAsset.asset} appears when named` : undefined,
    mood: "neutral",
  };
}

export function ViralTeardownModal({
  isDark,
  projectId,
  product,
  idea,
  elements,
  onClose,
  onUse,
}: {
  isDark: boolean;
  projectId: string;
  product?: string;
  idea?: { title?: string; enemy?: string; failureMoment?: string; angle?: string };
  elements?: string[];
  onClose: () => void;
  onUse: (brief: Partial<UgcBrief>, refId: string) => void;
}) {
  const generateUploadUrl = useMutation(api.content.generateClipUploadUrl);
  const saveRef = useMutation(api.content.saveViralReference);

  const fileRef = useRef<HTMLInputElement>(null);
  const [format, setFormat] = useState("mid_funnel");
  const [platform, setPlatform] = useState("tiktok");
  const [url, setUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [notes, setNotes] = useState("");
  const [phase, setPhase] = useState<"idle" | "frames" | "analyzing">("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ res: Result; refId: string } | null>(null);

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

  async function generate() {
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
          enemy: idea?.enemy,
          format,
          elements,
          platform,
          url: url.trim() || undefined,
          caption: caption.trim() || undefined,
          notes: notes.trim() || undefined,
          frameStorageIds,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `generation failed (${res.status})`);
      }
      const parsed = (await res.json()) as Result;
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
      setError(e instanceof Error ? e.message : "generation failed");
    } finally {
      setPhase("idle");
    }
  }

  const busy = phase !== "idle";
  const ad = result?.res.ad;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6">
      <div className="modal-backdrop absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        className={`modal-card relative z-10 flex max-h-[88vh] w-full max-w-[600px] flex-col overflow-hidden rounded-2xl border shadow-2xl ${
          isDark ? "border-white/10 bg-[#18181b] text-zinc-100" : "border-zinc-200 bg-white text-zinc-900"
        }`}
        role="dialog"
        aria-modal="true"
      >
        <div className={`flex items-start justify-between gap-3 border-b px-5 py-4 ${isDark ? "border-white/10" : "border-zinc-200"}`}>
          <div className="min-w-0">
            <div className={`text-[11px] uppercase tracking-[0.08em] ${mutedTextClass(isDark)}`}>UGC ad generator</div>
            <h3 className="mt-0.5 text-base font-semibold leading-snug">
              {ad ? "Your ad" : "Write an ad"}
            </h3>
          </div>
          <button onClick={onClose} aria-label="Close" className={`shrink-0 rounded-lg px-2 py-1 text-sm ${isDark ? "text-zinc-400 hover:bg-white/10" : "text-zinc-500 hover:bg-zinc-100"}`}>×</button>
        </div>

        <div className="debug-scroll flex-1 space-y-3 overflow-y-auto px-5 py-4 text-sm">
          {!result && (
            <>
              <Field label="Format" isDark={isDark}>
                <div className="flex flex-wrap gap-1.5">
                  {FORMATS.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setFormat(f.id)}
                      className={`rounded-lg border px-2 py-1 text-[11px] font-medium ${
                        format === f.id
                          ? isDark ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" : "border-emerald-300 bg-emerald-50 text-emerald-700"
                          : isDark ? "border-white/10 text-zinc-400 hover:bg-white/5" : "border-zinc-200 text-zinc-500 hover:bg-zinc-50"
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </Field>
              <p className={`text-xs ${mutedTextClass(isDark)}`}>
                Optional: feed a viral video that's performing well to replicate its template. Upload it for
                frame-level analysis, or paste the link + describe what happens.
              </p>
              <div className="flex gap-2">
                <label className="flex flex-col gap-1">
                  <span className={`text-[10px] uppercase tracking-[0.08em] ${mutedTextClass(isDark)}`}>Platform</span>
                  <select value={platform} onChange={(e) => setPlatform(e.target.value)} className={selectClass(isDark)}>
                    {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </label>
                <label className="flex flex-1 flex-col gap-1">
                  <span className={`text-[10px] uppercase tracking-[0.08em] ${mutedTextClass(isDark)}`}>URL</span>
                  <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" className={inputClass(isDark)} />
                </label>
              </div>
              <Field label="Caption" isDark={isDark}>
                <input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="the reference post's caption" className={inputClass(isDark)} />
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

          {ad && (
            <>
              <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                <Tag isDark={isDark}>{ad.format}</Tag>
                {ad.variationType && <Tag isDark={isDark}>{ad.variationType}</Tag>}
                {ad.enemy && <Tag isDark={isDark}>enemy: {ad.enemy}</Tag>}
              </div>
              {ad.hook && (
                <Block title="Hook" isDark={isDark}>
                  <p className={bodyTextClass(isDark)}>{ad.hook}</p>
                </Block>
              )}
              {ad.script && (
                <Block title="Voiceover" isDark={isDark} copy={ad.script}>
                  <p className={`whitespace-pre-wrap ${bodyTextClass(isDark)}`}>{ad.script}</p>
                </Block>
              )}
              {ad.analogy && (
                <Block title="Analogy (the money line)" isDark={isDark}>
                  <p className={bodyTextClass(isDark)}>{ad.analogy}</p>
                </Block>
              )}
              {ad.scenes.length > 0 && (
                <Block title={`Scenes (@asset ${ad.scenes.map((s) => (s.assetIncluded ? "YES" : "NO")).join("/")})`} isDark={isDark}>
                  <div className="space-y-1.5">
                    {ad.scenes.map((s, i) => (
                      <div key={i} className={`rounded-lg border p-2 text-[11px] ${isDark ? "border-white/10" : "border-zinc-200"}`}>
                        <div className={`font-medium ${bodyTextClass(isDark)}`}>
                          {i + 1}. {s.beat}{s.seconds ? ` · ${s.seconds}s` : ""}{s.assetIncluded ? ` · ${s.asset ?? "@asset"}` : " · no product"}
                        </div>
                        <div className={mutedTextClass(isDark)}>{s.direction}</div>
                        {s.voiceover && <div className={`mt-0.5 ${bodyTextClass(isDark)}`}>"{s.voiceover}"</div>}
                      </div>
                    ))}
                  </div>
                </Block>
              )}
              {ad.avatarPrompt && (
                <Block title="Avatar prompt (GPT Image 2)" isDark={isDark} copy={ad.avatarPrompt}>
                  <p className={`whitespace-pre-wrap ${bodyTextClass(isDark)}`}>{ad.avatarPrompt}</p>
                </Block>
              )}
              {ad.caption && (
                <Block title="Caption" isDark={isDark} copy={ad.caption}>
                  <p className={bodyTextClass(isDark)}>{ad.caption}</p>
                </Block>
              )}
            </>
          )}
        </div>

        <div className={`flex items-center justify-end gap-2 border-t px-5 py-3 ${isDark ? "border-white/10" : "border-zinc-200"}`}>
          {result && ad ? (
            <>
              <button onClick={() => setResult(null)} className={ghostBtn(isDark)}>Back</button>
              <button onClick={() => { onUse(adToBrief(ad, result.refId), result.refId); onClose(); }} className={primaryBtn(isDark)}>Use as brief</button>
            </>
          ) : (
            <>
              <button onClick={onClose} className={ghostBtn(isDark)}>Cancel</button>
              <button onClick={generate} disabled={busy} className={primaryBtn(isDark)}>
                {phase === "frames" ? "reading frames…" : phase === "analyzing" ? "writing…" : "Generate ad"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Tag({ isDark, children }: { isDark: boolean; children: React.ReactNode }) {
  return (
    <span className={`rounded-md border px-1.5 py-0.5 ${isDark ? "border-white/10 text-zinc-400" : "border-zinc-200 text-zinc-500"}`}>{children}</span>
  );
}

function Block({ title, isDark, copy, children }: { title: string; isDark: boolean; copy?: string; children: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className={subtlePanelClass(isDark, "p-2.5")}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className={`text-[10px] uppercase tracking-[0.08em] ${mutedTextClass(isDark)}`}>{title}</span>
        {copy && (
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(copy).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}
            className={`rounded-lg border px-2 py-0.5 text-[10px] font-medium ${isDark ? "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10" : "border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100"}`}
          >
            {copied ? "copied" : "copy"}
          </button>
        )}
      </div>
      <div className="text-xs">{children}</div>
    </div>
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
function selectClass(isDark: boolean): string {
  return `rounded-lg border px-2 py-1.5 text-xs ${isDark ? "border-white/10 bg-white/5 text-zinc-200" : "border-zinc-200 bg-white text-zinc-700"}`;
}
function ghostBtn(isDark: boolean): string {
  return `rounded-lg border px-3 py-1.5 text-xs font-medium ${isDark ? "border-white/10 text-zinc-300 hover:bg-white/10" : "border-zinc-200 text-zinc-600 hover:bg-zinc-100"}`;
}
function primaryBtn(isDark: boolean): string {
  return `rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-40 ${isDark ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300 hover:bg-emerald-400/20" : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"}`;
}
