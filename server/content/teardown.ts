// Ad generator — the front of the UGC funnel. Given a product, an idea/enemy,
// the chosen dials, and optionally a viral reference (URL/caption/notes + frames
// for multimodal analysis), it writes a framework-compliant UGC ad: hook, full
// voiceover, per-scene prompts (with the @asset NO/YES pattern), a GPT Image 2
// avatar prompt, and an organic caption. The viral video informs the template
// only; it is never generated. Runs on the Express server via runAgentRuntime.

import { runAgentRuntime } from "../runtimes/index.js";
import { getRuntimeConfig } from "../runtime-config.js";
import { buildPromptWithImages, fetchStoredBytes } from "../images/content-blocks.js";
import { UGC_FRAMEWORK_SYSTEM, buildUgcUserText, type UgcRequest } from "./ugcFramework.js";

export type { UgcRequest };

export interface Teardown {
  hook: string;
  whyItWorks: string[];
  structure: { t?: string; beat: string }[];
  voiceoverStyle: string;
  mood: string;
  pacing: string;
  format: string;
}

export interface AdScene {
  beat: string;
  voiceover: string;
  seconds?: string;
  assetIncluded: boolean;
  asset?: string;
  direction: string;
  continuity?: string;
}

export interface Ad {
  format: string; // mid_funnel | full_stack | animated_infomercial
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

export interface TeardownResult {
  teardown: Teardown | null;
  ad: Ad;
}

function parseResult(text: string): TeardownResult {
  const cleaned = text.replace(/^```(json)?/gm, "").replace(/```$/gm, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < 0) throw new Error("no JSON object in generator response");
  const parsed = JSON.parse(cleaned.slice(start, end + 1)) as Partial<TeardownResult>;
  if (!parsed.ad || typeof parsed.ad !== "object") throw new Error("generator response missing 'ad'");
  const ad = parsed.ad as Ad;
  if (!Array.isArray(ad.scenes)) ad.scenes = [];
  return {
    teardown: (parsed.teardown as Teardown | null) ?? null,
    ad,
  };
}

export async function analyzeTeardown(opts: UgcRequest): Promise<TeardownResult> {
  const runtimeConfig = await getRuntimeConfig();
  const prompt = await buildPromptWithImages({
    text: buildUgcUserText(opts),
    imageStorageIds: opts.frameStorageIds,
    fetchBytes: fetchStoredBytes,
  });
  const result = await runAgentRuntime(runtimeConfig, {
    prompt,
    systemPrompt: UGC_FRAMEWORK_SYSTEM,
    tools: [],
    mode: "execution",
  });
  return parseResult(result.text);
}
