import { useState } from "react";
import {
  composeScenePrompt,
  deriveElements,
  type UgcScene,
} from "../lib/contentPrompts.js";
import { bodyTextClass, mutedTextClass } from "./PanelPrimitives.js";

// The copy-paste layout for a chunked ad. One universal direction block pasted
// into every chunk, then swap only the chunk; plus the elements to attach,
// tagged to the chunks that use them. Shared by the generator modal and the
// composer so the two never diverge.

export function AdSections({
  isDark,
  universalBlock,
  scenes,
  avatarPrompt,
  avatarId,
  showAvatar = true,
}: {
  isDark: boolean;
  universalBlock?: string;
  scenes?: UgcScene[];
  avatarPrompt?: string;
  avatarId?: string;
  showAvatar?: boolean;
}) {
  const elements = deriveElements({ scenes, avatarPrompt, avatarId });
  const hasChunks = (scenes?.length ?? 0) > 0;
  const assetPattern = (scenes ?? []).map((s) => (s.assetIncluded ? "YES" : "NO")).join("/");

  return (
    <div className="space-y-2.5">
      {showAvatar && avatarPrompt && (
        <CopyBlock title="① Avatar — make this element first (GPT Image 2)" isDark={isDark} text={avatarPrompt}>
          <p className={`whitespace-pre-wrap text-[11px] ${bodyTextClass(isDark)}`}>{avatarPrompt}</p>
        </CopyBlock>
      )}

      {universalBlock && (
        <CopyBlock title="② Universal block — paste into EVERY chunk" isDark={isDark} text={universalBlock}>
          <pre className={`whitespace-pre-wrap text-[11px] leading-relaxed ${bodyTextClass(isDark)}`}>{universalBlock}</pre>
        </CopyBlock>
      )}

      {hasChunks && (
        <div>
          <div className={`mb-1 text-[10px] uppercase tracking-[0.08em] ${mutedTextClass(isDark)}`}>
            ③ Chunks — keep ② above, swap only this{assetPattern ? ` · @asset ${assetPattern}` : ""}
          </div>
          <div className="space-y-1.5">
            {scenes!.map((s, i) => {
              const text = composeScenePrompt(s, i);
              return (
                <div key={i} className={`rounded-lg border p-2 ${isDark ? "border-white/10" : "border-zinc-200"}`}>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className={`text-[10px] font-medium ${bodyTextClass(isDark)}`}>
                      Chunk {i + 1} — {s.beat}
                    </span>
                    <CopyButton text={text} isDark={isDark} />
                  </div>
                  <pre className={`whitespace-pre-wrap text-[11px] leading-relaxed ${bodyTextClass(isDark)}`}>{text}</pre>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {elements.length > 0 && (
        <div>
          <div className={`mb-1 text-[10px] uppercase tracking-[0.08em] ${mutedTextClass(isDark)}`}>
            ④ Elements to attach
          </div>
          <ul className="space-y-0.5">
            {elements.map((e) => (
              <li key={e.name} className={`text-[11px] ${bodyTextClass(isDark)}`}>
                <span className="mono">{e.name}</span>
                <span className={mutedTextClass(isDark)}> ({e.kind}) → </span>
                {e.kind === "avatar" ? "every chunk" : `chunk ${e.scenes.join(", ")}`}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function CopyBlock({
  title,
  isDark,
  text,
  children,
}: {
  title: string;
  isDark: boolean;
  text: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-lg border ${isDark ? "border-white/10 bg-black/20" : "border-zinc-200 bg-zinc-50"} p-2.5`}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className={`text-[10px] uppercase tracking-[0.08em] ${mutedTextClass(isDark)}`}>{title}</span>
        <CopyButton text={text} isDark={isDark} />
      </div>
      {children}
    </div>
  );
}

function CopyButton({ text, isDark }: { text: string; isDark: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}
      className={`shrink-0 rounded-lg border px-2 py-0.5 text-[10px] font-medium ${
        isDark ? "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10" : "border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100"
      }`}
    >
      {copied ? "copied" : "copy"}
    </button>
  );
}
