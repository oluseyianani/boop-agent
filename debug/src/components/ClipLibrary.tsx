import { useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api.js";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  EmptyState,
  bodyTextClass,
  mutedTextClass,
  panelCardClass,
  subtlePanelClass,
} from "./PanelPrimitives.js";

// Reference clip library: the app screen recordings (full walkthrough +
// per-tab standalones) that a UGC brief anchors to as Seedance's starting
// footage. Upload → tag → list. Stored in Convex file storage.

export const CLIP_TAGS = [
  "full-walkthrough",
  "list",
  "receipt-scan",
  "standalone-recipe",
  "receipt",
  "analytics",
  "other",
] as const;

type ClipTag = (typeof CLIP_TAGS)[number];

interface ClipRow {
  clipId: string;
  label: string;
  tag: string;
  durationSec?: number;
  addedAt: number;
  url: string | null;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function ClipLibrary({ isDark, projectId }: { isDark: boolean; projectId: string }) {
  const clips = useQuery(api.content.listClips, { projectId }) as ClipRow[] | undefined;
  const generateUploadUrl = useMutation(api.content.generateClipUploadUrl);
  const registerClip = useMutation(api.content.registerClip);
  const deleteClip = useMutation(api.content.deleteClip);

  const fileRef = useRef<HTMLInputElement>(null);
  const [label, setLabel] = useState("");
  const [tag, setTag] = useState<ClipTag>("full-walkthrough");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Choose a video file first.");
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const uploadUrl = await generateUploadUrl();
      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type || "video/mp4" },
        body: file,
      });
      if (!res.ok) throw new Error(`upload failed (${res.status})`);
      const { storageId } = (await res.json()) as { storageId: string };
      const name = label.trim() || file.name.replace(/\.[^.]+$/, "");
      const clipId = `${slugify(name) || "clip"}-${Date.now().toString(36)}`;
      await registerClip({
        projectId,
        clipId,
        label: name,
        tag,
        storageId: storageId as Id<"_storage">,
      });
      setLabel("");
      if (fileRef.current) fileRef.current.value = "";
    } catch (e) {
      setError(e instanceof Error ? e.message : "upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <section className={panelCardClass(isDark, "p-4")}>
      <h3 className="text-sm font-medium">Reference clips</h3>
      <p className={`mt-0.5 text-xs ${mutedTextClass(isDark)}`}>
        App screen recordings you feed Seedance as starting footage. Tag each one so any
        brief can pull the right clip as its [Video1] anchor.
      </p>

      <div className={subtlePanelClass(isDark, "mt-3 flex flex-wrap items-end gap-2 p-3")}>
        <label className="flex min-w-[160px] flex-1 flex-col gap-1">
          <span className={`text-[10px] uppercase tracking-[0.08em] ${mutedTextClass(isDark)}`}>
            Label
          </span>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. list tab walkthrough"
            className={`rounded-lg border px-2 py-1.5 text-xs ${
              isDark
                ? "border-white/10 bg-white/5 text-zinc-100 placeholder:text-zinc-600"
                : "border-zinc-200 bg-white text-zinc-900 placeholder:text-zinc-400"
            }`}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={`text-[10px] uppercase tracking-[0.08em] ${mutedTextClass(isDark)}`}>
            Tag
          </span>
          <select
            value={tag}
            onChange={(e) => setTag(e.target.value as ClipTag)}
            className={`rounded-lg border px-2 py-1.5 text-xs ${
              isDark ? "border-white/10 bg-white/5 text-zinc-200" : "border-zinc-200 bg-white text-zinc-700"
            }`}
          >
            {CLIP_TAGS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <input
          ref={fileRef}
          type="file"
          accept="video/*"
          className={`max-w-[190px] text-xs ${bodyTextClass(isDark)} file:mr-2 file:rounded-lg file:border-0 file:bg-zinc-200 file:px-2 file:py-1 file:text-xs file:text-zinc-800`}
        />
        <button
          type="button"
          disabled={uploading}
          onClick={handleUpload}
          className={`rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${
            isDark
              ? "border-white/10 bg-white/5 text-zinc-100 hover:bg-white/10"
              : "border-zinc-200 bg-zinc-50 text-zinc-900 hover:bg-zinc-100"
          }`}
        >
          {uploading ? "uploading…" : "Upload"}
        </button>
      </div>
      {error && <p className="mt-1.5 text-xs text-rose-400">{error}</p>}

      <div className="mt-3">
        {clips === undefined ? (
          <EmptyState isDark={isDark}>Loading…</EmptyState>
        ) : clips.length === 0 ? (
          <EmptyState isDark={isDark}>
            No clips yet. Record the app (full walkthrough + each tab) and upload here.
          </EmptyState>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {clips.map((clip) => (
              <div key={clip.clipId} className={subtlePanelClass(isDark, "overflow-hidden p-2")}>
                {clip.url ? (
                  <video
                    src={clip.url}
                    controls
                    preload="metadata"
                    className="aspect-[9/16] w-full rounded-lg bg-black object-cover"
                  />
                ) : (
                  <div className="flex aspect-[9/16] w-full items-center justify-center rounded-lg bg-black/40 text-[10px] text-zinc-500">
                    unavailable
                  </div>
                )}
                <div className="mt-1.5 flex items-start justify-between gap-1.5">
                  <div className="min-w-0">
                    <div className={`truncate text-xs font-medium ${bodyTextClass(isDark)}`}>
                      {clip.label}
                    </div>
                    <div className={`mono text-[10px] ${mutedTextClass(isDark)}`}>{clip.tag}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`Delete "${clip.label}"?`)) {
                        void deleteClip({ projectId, clipId: clip.clipId });
                      }
                    }}
                    aria-label="Delete clip"
                    className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] ${
                      isDark ? "text-zinc-500 hover:bg-white/10" : "text-zinc-400 hover:bg-zinc-100"
                    }`}
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
