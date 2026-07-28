import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api.js";
import { bodyTextClass, mutedTextClass, subtlePanelClass } from "./PanelPrimitives.js";

// Mark an idea posted, capturing a link per platform. Every platform the piece
// went to gets its own row + url (so a future stats pull can address it). Opened
// from idea rows, the detail drawer, and calendar slots.

interface PostEntry {
  selected: boolean;
  url: string;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function MarkPostedModal({
  isDark,
  projectId,
  ideaId,
  ideaTitle,
  platforms,
  presetPlatform,
  slotKey,
  format,
  onClose,
}: {
  isDark: boolean;
  projectId: string;
  ideaId: string;
  ideaTitle: string;
  platforms: string[];
  presetPlatform?: string;
  slotKey?: string;
  format?: string;
  onClose: () => void;
}) {
  const markPosted = useMutation(api.content.markIdeaPosted);
  const [entries, setEntries] = useState<Record<string, PostEntry>>(() =>
    Object.fromEntries(
      platforms.map((p) => [p, { selected: p === presetPlatform, url: "" }]),
    ),
  );
  const [date, setDate] = useState(todayIso());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const chosen = platforms.filter((p) => entries[p]?.selected);
  const ready = chosen.length > 0 && chosen.every((p) => entries[p].url.trim());

  function set(platform: string, patch: Partial<PostEntry>) {
    setEntries((prev) => ({ ...prev, [platform]: { ...prev[platform], ...patch } }));
  }

  async function submit() {
    if (!ready) {
      setError("Add a link for each selected platform.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const postedAt = new Date(`${date}T12:00:00`).getTime();
      await markPosted({
        projectId,
        ideaId,
        format,
        slotKey,
        posts: chosen.map((p) => ({ platform: p, url: entries[p].url.trim(), postedAt })),
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to save");
      setSaving(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <div className="modal-backdrop absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        className={`modal-card relative z-10 flex max-h-[85vh] w-full max-w-[460px] flex-col overflow-hidden rounded-2xl border shadow-2xl ${
          isDark ? "border-white/10 bg-[#18181b] text-zinc-100" : "border-zinc-200 bg-white text-zinc-900"
        }`}
        role="dialog"
        aria-modal="true"
      >
        <div className={`flex items-start justify-between gap-3 border-b px-5 py-4 ${isDark ? "border-white/10" : "border-zinc-200"}`}>
          <div className="min-w-0">
            <div className={`text-[11px] uppercase tracking-[0.08em] ${mutedTextClass(isDark)}`}>
              Mark posted
            </div>
            <h3 className="mt-0.5 truncate text-base font-semibold leading-snug">{ideaTitle}</h3>
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

        <div className="debug-scroll flex-1 space-y-2.5 overflow-y-auto px-5 py-4 text-sm">
          <p className={`text-xs ${mutedTextClass(isDark)}`}>
            Tick each platform you posted on and paste the link — we keep them so you can pull
            stats later.
          </p>
          {platforms.map((p) => {
            const entry = entries[p];
            return (
              <div key={p} className={subtlePanelClass(isDark, "p-2.5")}>
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={entry.selected}
                    onChange={(e) => set(p, { selected: e.target.checked })}
                    className="accent-emerald-500"
                  />
                  <span className={`text-xs font-medium capitalize ${bodyTextClass(isDark)}`}>{p}</span>
                </label>
                {entry.selected && (
                  <input
                    value={entry.url}
                    onChange={(e) => set(p, { url: e.target.value })}
                    placeholder={`https://… link to the ${p} post`}
                    className={`mt-2 w-full rounded-lg border px-2 py-1.5 text-xs outline-none ${
                      isDark
                        ? "border-white/10 bg-white/5 text-zinc-100 placeholder:text-zinc-600"
                        : "border-zinc-200 bg-white text-zinc-900 placeholder:text-zinc-400"
                    }`}
                  />
                )}
              </div>
            );
          })}

          <label className="flex items-center justify-between gap-2 pt-1">
            <span className={`text-xs ${mutedTextClass(isDark)}`}>Posted on</span>
            <input
              type="date"
              value={date}
              max={todayIso()}
              onChange={(e) => setDate(e.target.value)}
              className={`rounded-lg border px-2 py-1 text-xs ${
                isDark ? "border-white/10 bg-white/5 text-zinc-200" : "border-zinc-200 bg-white text-zinc-700"
              }`}
            />
          </label>

          {error && <p className="text-xs text-rose-400">{error}</p>}
        </div>

        <div className={`flex items-center justify-end gap-2 border-t px-5 py-3 ${isDark ? "border-white/10" : "border-zinc-200"}`}>
          <button
            onClick={onClose}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
              isDark ? "border-white/10 text-zinc-300 hover:bg-white/10" : "border-zinc-200 text-zinc-600 hover:bg-zinc-100"
            }`}
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!ready || saving}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-40 ${
              isDark
                ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300 hover:bg-emerald-400/20"
                : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
            }`}
          >
            {saving ? "saving…" : `Mark posted${chosen.length ? ` · ${chosen.length}` : ""}`}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
