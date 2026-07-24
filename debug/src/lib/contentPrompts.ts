// Generation-prompt composer — port of composePrompt/carouselPlan from
// content-agent's run-agents.js. The bank stores only each prompt's visual
// composition core; this wraps it with product context, the brand system,
// and render rules so the result is a self-contained copy-paste brief for
// standalone generators (Higgsfield, Midjourney, ChatGPT…).

interface IdeaLike {
  title: string;
  enemy: string;
  failureMoment?: string;
  angle?: string;
}

interface ScriptLike {
  hooks?: string[];
  cta?: string;
}

interface GenPrompt {
  label?: string;
  prompt?: string;
}

interface ProjectLike {
  productBlurb?: string;
  positioning?: string;
  accentColor?: string;
}

function carouselPlan(idea: IdeaLike, script: ScriptLike | null): string {
  const hooks = script?.hooks ?? [];
  const cta = (script?.cta ?? "Twizle prices the list and reads the receipt.").replace(
    / Link in bio\.?$/,
    "",
  );
  return `
FULL CAROUSEL PLAN — generate all 5 slides, 4:5 each, same brand system throughout:
- Slide 1 (cover): exactly the composition described above, keeping its stated headline.
- Slide 2 (the failure moment): dramatise this: ${idea.failureMoment}. Headline exactly: "${hooks[1] ?? idea.failureMoment}". Keep the visual simple — one object or screen that embodies the moment.
- Slide 3 (respect the alternative): one line acknowledging what ${idea.enemy === "doing nothing" ? "the current habit" : "the " + idea.enemy} does well, then the loophole underneath in bold. Two short lines of text only.
- Slide 4 (the fix): a clean smartphone mockup on the paper background showing the relevant Twizle screen for this concept: ${idea.angle} Green accent on the key number.
- Slide 5 (CTA end card): headline exactly: "${cta}" with a small footer line "Twizle — free on the App Store". Mostly whitespace, one receipt motif element.`;
}

export function composePrompt(
  project: ProjectLike,
  idea: IdeaLike,
  script: ScriptLike | null,
  g: GenPrompt,
): string {
  const accent = project.accentColor ?? "#08A00E";
  const isCarousel = /carousel/i.test(g.label ?? "");
  const isVideo = /video|9:16.*s\)/i.test(g.label ?? "");
  return `=== CONTEXT (read fully before generating) ===
You are creating social media content for TWIZLE. ${project.productBlurb ?? ""}
Brand promise: ${project.positioning ?? ""} — Twizle is the connection.
THIS PIECE'S CONCEPT: "${idea.title}". The enemy is ${idea.enemy}; the failure moment is: ${idea.failureMoment}. The content dramatises that failure and shows Twizle closing it. Never mock the person — the frame is "you've outgrown this", not "you were wrong".

=== BRAND SYSTEM (follow strictly) ===
- One accent colour only: green ${accent}. Background: warm off-white paper (#F6F4EF). Text: near-black ink (#14231A), mid-grey (#647065) for secondary.
- Typography: bold modern geometric sans-serif (Montserrat/Inter feel). Sentence case, never Title Case. Numbers rendered big and bold.
- Motifs: till-receipt aesthetic (itemised lines, dashed tear edges), subtle dot grid, soft realistic shadows, generous whitespace, editorial magazine layout.
- Mood: calm, confident personal-finance editorial. Not corporate, not cartoonish.

=== DELIVERABLE ===
${g.prompt ?? ""}
${isCarousel ? carouselPlan(idea, script) : ""}
=== RENDER RULES ===
- Render every quoted text string EXACTLY as written, and add NO other words, labels or captions to the image${isVideo ? " or video" : ""}.
- No people, no faces. No real supermarket or bank logos (a plain-text word like "Tesco" inside quoted copy is fine). No watermarks, no emoji.
- UK context: prices in £.${isVideo ? "\n- Vertical 9:16, smooth realistic motion, soft natural light unless the deliverable says otherwise." : ""}`;
}
