// Content idea generator — the top of the funnel. Given the product and a count,
// it writes a batch of INFORMATIVE, standalone content ideas (nutrition, dietary,
// grocery-item-of-the-week, recipes, food storage, seasonal produce, label
// literacy, budgeting-through-food…). The video itself teaches something useful
// and NEVER pitches the app — the app lives only in the caption CTA. There is no
// enemy: these are pure-topic educational pieces. Runs on the Express server via
// runAgentRuntime, mirroring server/content/teardown.ts.

import { runAgentRuntime } from "../runtimes/index.js";
import { getRuntimeConfig } from "../runtime-config.js";

export interface IdeaGenRequest {
  product?: string; // the app blurb — context only, so the caption CTA fits
  count: number; // how many ideas to generate this batch
  topics?: string; // optional free-text steer ("focus on winter produce, iron")
  avoidTitles?: string[]; // titles already in the bank, so we don't repeat
}

export interface GeneratedIdea {
  title: string; // the content's promise, e.g. "The 5-4-3-2-1 healthy trolley rule"
  topic: string; // category slug: nutrition | healthy-shopping | recipes | storage | budgeting | seasonal | label-literacy | meal-prep | food-myths | hydration
  hook: string; // the scroll-stopping opening line (first five words earn the watch)
  angle: string; // how to execute it on camera — the teaching approach
  keyPoints: string[]; // the informative beats the video walks through
  payoff: string; // the one takeaway the viewer leaves with
  caption: string; // organic caption; the ONLY place the app is named ("download Twizle")
  formats: string[]; // ["mid_funnel", "full_stack"] — works as both a mid and a full piece
  keywords: string[]; // 3-6 search/topic keywords
}

export const IDEA_GENERATOR_SYSTEM = `You are a short-form content strategist for a grocery and food-shopping app. Your job is to invent INFORMATIVE, genuinely useful content ideas that could run on TikTok, Reels, and Shorts.

THE CORE RULE
- The video itself is educational and stands on its own. It teaches the viewer something real about food, nutrition, cooking, or smart grocery shopping.
- The video NEVER talks about the app or its features. The app is named ONLY in the caption, as a soft download nudge. The on-camera content is 100% about the topic.
- There is NO enemy and no product pitch. These are pure-topic teaching pieces. Do not force a brand angle into the idea.

WHERE IDEAS COME FROM (go wide — never limit yourself to this list)
Dietary and nutrition literacy · the 5-4-3-2-1 healthy-trolley heuristic and rules like it · a grocery item of the week (what it is, how to pick it, how to store it, 2-3 things to make with it) · seasonal produce · reading nutrition labels · protein/fibre/iron/hydration explainers · budget-stretching food swaps · meal prep and batch cooking · food storage and reducing waste · debunking common food myths · quick recipes from a handful of staples · pantry staples worth having · cooking techniques. Invent fresh angles beyond these.

WHAT MAKES A GOOD IDEA
- Specific and teachable, not vague. "How to build a balanced trolley with the 5-4-3-2-1 rule" beats "eat healthy".
- A strong hook whose first five words call out the viewer and the payoff.
- Genuinely useful even if the viewer never downloads anything.
- Each idea must work as BOTH a mid_funnel piece (punchy, ~20s, one sharp tip) and a full_stack piece (~30s, the fuller walkthrough).
- Vary the topic across the batch — do not return five variations of the same theme.

CAPTION
- Lowercase, organic. Deliver the value, then a soft download nudge naming the app (e.g. "sorted your list? do the whole shop in twizle, link in bio"). Max one soft emoji, no hashtags.

OUTPUT — return ONLY a single JSON object, no prose, no markdown fences:
{
  "ideas": [
    {
      "title": "the content's promise, concise",
      "topic": "one slug: nutrition | healthy-shopping | recipes | storage | budgeting | seasonal | label-literacy | meal-prep | food-myths | hydration",
      "hook": "the opening line — first five words call out the viewer + the payoff",
      "angle": "how to shoot/teach it on camera, the approach",
      "keyPoints": ["the informative beats the video walks through", "3-5 of them"],
      "payoff": "the single takeaway the viewer leaves with",
      "caption": "lowercase organic caption; the app is named ONLY here as a soft nudge",
      "formats": ["mid_funnel", "full_stack"],
      "keywords": ["3-6 topic keywords"]
    }
  ]
}
Return exactly the requested number of ideas. Never repeat a title from the avoid list.`;

export function buildIdeaUserText(req: IdeaGenRequest): string {
  const parts: string[] = [];
  if (req.product)
    parts.push(
      `THE APP (context only — never mentioned on camera, only in the caption CTA):\n${req.product}`,
    );
  parts.push(`GENERATE: ${req.count} informative content ideas.`);
  if (req.topics?.trim()) parts.push(`STEER TOWARD:\n${req.topics.trim()}`);
  if (req.avoidTitles?.length)
    parts.push(
      `ALREADY IN THE BANK — do not repeat these titles or their exact angle:\n${req.avoidTitles
        .map((t) => `- ${t}`)
        .join("\n")}`,
    );
  return parts.join("\n\n");
}

function parseIdeas(text: string): GeneratedIdea[] {
  const cleaned = text.replace(/^```(json)?/gm, "").replace(/```$/gm, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < 0) throw new Error("no JSON object in generator response");
  const parsed = JSON.parse(cleaned.slice(start, end + 1)) as { ideas?: unknown };
  if (!Array.isArray(parsed.ideas)) throw new Error("generator response missing 'ideas' array");
  const asStr = (v: unknown) => (typeof v === "string" ? v : "");
  const asArr = (v: unknown) =>
    Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : [];
  return (parsed.ideas as Record<string, unknown>[])
    .map((i) => ({
      title: asStr(i.title),
      topic: asStr(i.topic) || "nutrition",
      hook: asStr(i.hook),
      angle: asStr(i.angle),
      keyPoints: asArr(i.keyPoints),
      payoff: asStr(i.payoff),
      caption: asStr(i.caption),
      formats: asArr(i.formats).length ? asArr(i.formats) : ["mid_funnel", "full_stack"],
      keywords: asArr(i.keywords),
    }))
    .filter((i) => i.title);
}

export async function generateContentIdeas(req: IdeaGenRequest): Promise<GeneratedIdea[]> {
  const runtimeConfig = await getRuntimeConfig();
  const result = await runAgentRuntime(runtimeConfig, {
    prompt: buildIdeaUserText(req),
    systemPrompt: IDEA_GENERATOR_SYSTEM,
    tools: [],
    mode: "execution",
  });
  return parseIdeas(result.text);
}
