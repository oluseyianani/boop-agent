// Viral video teardown — the front of the UGC funnel.
//
// The user feeds a niche video that's performing well; we analyse WHY it works
// (hook, structure, VO cadence, mood) and draft a short, directive UGC brief in
// the Seedance winning style, adapted to the product. The viral video informs
// the template only — it is never sent to Seedance; the drafted brief anchors
// to an app clip ([Video1]) at compose time.
//
// Runs on the Express server (where the Claude runtime already lives) via the
// established runAgentRuntime path, with optional client-extracted frames sent
// as image blocks for real multimodal analysis.

import { runAgentRuntime } from "../runtimes/index.js";
import { getRuntimeConfig } from "../runtime-config.js";
import { buildPromptWithImages, fetchStoredBytes } from "../images/content-blocks.js";

export interface Teardown {
  hook: string;
  whyItWorks: string[];
  structure: { t?: string; beat: string }[];
  voiceoverStyle: string;
  mood: string;
  pacing: string;
  format: string; // talking-head | over-the-shoulder | POV | …
}

// Mirrors the composer's UgcBrief rigid fields (minus ids/clips, filled client-side).
export interface DraftBrief {
  label?: string;
  voiceover?: string;
  mood?: string;
  scene?: string;
  actorBlocking?: string;
  camera?: string;
  appMoment?: string;
}

export interface TeardownResult {
  teardown: Teardown | null;
  draftBrief: DraftBrief;
}

export interface TeardownRequest {
  product?: string; // what the product is + its promise, for adaptation
  platform?: string;
  url?: string;
  caption?: string;
  notes?: string; // the user's beat-by-beat "what happens"
  frameStorageIds?: string[];
  idea?: { title?: string; enemy?: string; failureMoment?: string; angle?: string };
}

const SYSTEM = `You are a short-form UGC strategist. You reverse-engineer why a niche video performs, then draft ONE short, directive UGC video brief for the given product in the winning style.

TWO KINDS OF REFERENCE — never confuse them:
- The VIRAL reference (the video/frames/caption you are analysing) sets the creative TEMPLATE. It is never generated; you only learn from it.
- The APP CLIP is the product's own screen recording that plays on the actor's phone in the final video. In the brief, refer to it as [Video1].

The brief must be SHORT and directive (not a paragraph), matching how a real winning Seedance prompt reads: a verbatim voiceover line, a mood, the actor's blocking, one camera move, and where [Video1] appears — e.g. "influencer sitting on her bed typing, camera hard-cuts to over-the-shoulder, [Video1] showing on her phone, natural light, iPhone quality."

Adapt the hook and structure of the viral reference to the product HONESTLY — never claim features the product doesn't have.

Return ONLY a single JSON object, no prose, no markdown fences:
{
  "teardown": {
    "hook": "what grabs attention in the first ~2s",
    "whyItWorks": ["reason", "reason"],
    "structure": [{"t":"0s","beat":"..."}],
    "voiceoverStyle": "cadence/tone of the VO",
    "mood": "one or two words",
    "pacing": "how fast, cut rhythm",
    "format": "talking-head | over-the-shoulder | POV | ..."
  },
  "draftBrief": {
    "label": "short name",
    "voiceover": "verbatim spoken line adapted to the product",
    "mood": "neutral | excited | ...",
    "scene": "setting + lighting",
    "actorBlocking": "what the actor physically does",
    "camera": "one camera move",
    "appMoment": "[Video1] showing on her phone as she ..."
  }
}
If there is no viral reference (no url, caption, notes, or frames), set "teardown" to null and invent a strong original brief from the product and idea.`;

function buildText(opts: TeardownRequest): string {
  const parts: string[] = [];
  if (opts.product) parts.push(`PRODUCT:\n${opts.product}`);
  if (opts.idea) {
    const i = opts.idea;
    parts.push(
      `IDEA THIS BRIEF IS FOR:\n` +
        [
          i.title && `- concept: ${i.title}`,
          i.enemy && `- enemy: ${i.enemy}`,
          i.failureMoment && `- failure moment: ${i.failureMoment}`,
          i.angle && `- execution angle: ${i.angle}`,
        ]
          .filter(Boolean)
          .join("\n"),
    );
  }
  const ref: string[] = [];
  if (opts.platform) ref.push(`- platform: ${opts.platform}`);
  if (opts.url) ref.push(`- url: ${opts.url}`);
  if (opts.caption) ref.push(`- caption: ${opts.caption}`);
  if (opts.notes) ref.push(`- what happens: ${opts.notes}`);
  if (opts.frameStorageIds?.length)
    ref.push(`- ${opts.frameStorageIds.length} frames from the video are attached above.`);
  if (ref.length) parts.push(`VIRAL REFERENCE:\n${ref.join("\n")}`);
  else parts.push(`No viral reference provided — draft an original brief.`);
  return parts.join("\n\n");
}

function parseResult(text: string): TeardownResult {
  const cleaned = text.replace(/^```(json)?/gm, "").replace(/```$/gm, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < 0) throw new Error("no JSON object in teardown response");
  const parsed = JSON.parse(cleaned.slice(start, end + 1)) as Partial<TeardownResult>;
  if (!parsed.draftBrief || typeof parsed.draftBrief !== "object")
    throw new Error("teardown response missing draftBrief");
  return {
    teardown: (parsed.teardown as Teardown | null) ?? null,
    draftBrief: parsed.draftBrief as DraftBrief,
  };
}

export async function analyzeTeardown(opts: TeardownRequest): Promise<TeardownResult> {
  const runtimeConfig = await getRuntimeConfig();
  const prompt = await buildPromptWithImages({
    text: buildText(opts),
    imageStorageIds: opts.frameStorageIds,
    fetchBytes: fetchStoredBytes,
  });
  const result = await runAgentRuntime(runtimeConfig, {
    prompt,
    systemPrompt: SYSTEM,
    tools: [],
    mode: "execution",
  });
  return parseResult(result.text);
}
