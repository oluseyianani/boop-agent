---
name: ugc-ad-writer
description: Write framework-compliant AI-UGC video ad scripts and generation prompts — hook, voiceover script, per-scene (chunked) prompts, and a GPT Image 2 avatar prompt — using the Universal UGC Script Writing System v2. Niche/brand-agnostic. Use when creating UGC ads, TikTok/Reels ad scripts, Seedance/Higgsfield video prompts, avatar prompts, ad hooks, or when the user mentions UGC, Mid-Funnel Punchy, or Full Stack ad formats.
---

# UGC Ad Writer

Generates AI-UGC video ads from a strict framework. Works for **physical products and apps/software**. The two invariants that decide whether a script wins:

1. **The tactile analogy is the most important line** — the sentence a viewer repeats to a friend. Every script must contain one, in the shape `"Think of it less like ___ and more like ___"`.
2. **The product never appears on screen until the voiceover names it.** Enforced structurally via `@asset` inclusion: **mid-funnel NO/YES/NO**, **full-stack NO/NO/NO/YES/NO**.
3. **Write every visual direction POSITIVELY — video models render negated nouns and ignore "no".** Never write "no product", "no phone", "must not appear", "no fake buttons", "no cutaways" — naming a thing to forbid it makes the model render it. State only what IS in frame. Enforce "product not yet" by **omission** (in a product-free chunk, don't mention the product/phone/screen at all *and* attach no asset), never by "no product" text.

## Workflow

1. **Collect brand variables.** Never invent values — ask for any missing *required* one. See the input list in [references/framework.md](references/framework.md#brand-input-variables). Minimum: product name + category, core mechanism (12-year-old-simple), the tactile analogy, failed alternatives the audience tried, target avatar demographics, and the product/app reference asset.
2. **Choose the four dials:**
   - **Format** by funnel stage → `full_stack` (cold, full education arc, 28–32s / 150–180w / 5 beats) · `mid_funnel` (warm, fast credibility, 18–22s / 55–70w / 3 beats) · `animated_infomercial` (no creator, product is hero).
   - **Production mode** → `single_prompt` (one continuous prompt) or `chunked` (per-scene prompts to stitch — the pro tool workflow).
   - **Variation type** (persona/register) and **hook framework** and **pain point** — pick from [references/libraries.md](references/libraries.md).
3. **Write the voiceover** to the chosen format's beat structure (see framework.md). Obey the voice rules: no em dashes, no bolding, sentence flow over choppy fragments, swap AI-mispronounced words.
4. **Lock the character + paste the four direction blocks** (physical-product OR app/software variant) → [references/direction-blocks.md](references/direction-blocks.md).
5. **Emit output** (see Output contract below), plus a **GPT Image 2 avatar prompt** tuned to this pain point's audience (template in libraries.md).
6. **Run the QA lint** in [references/qa-checklist.md](references/qa-checklist.md) before delivering. Fix every hit.

## Output contract

- **`single_prompt`** → ONE clean prose prompt block. No headers, no tables, no meta-commentary. Character block → direction blocks → asset reference → b-roll/camera direction → scene/pacing note → `Here's the full script: "..."`.
- **`chunked`** → a **universal block** pasted UNCHANGED into every chunk (character lock + setting/lighting + authenticity + UGC-realism + consistency rules + avatar-element instruction), then per-chunk entries: chunk # + beat, exact voiceover line, runtime, `@asset` yes/no per the pattern, scene-specific visual direction, continuity. Bookend chunk 1 and the final chunk. **The universal block must be product-free** (no product/phone/screen words) because it lands in product-free chunks; the app-interaction/product direction rides only in the chunks where the product appears. `universal block + one chunk = one complete prompt`.
- **Avatar prompt** → always a separate block, GPT Image 2 / 9:16 / natural candid, matched to the audience's emotional register.
- For **apps/software**: the "product asset" is the app-screen reference element (e.g. a named Higgsfield element); reference it where the pattern says `@asset`. Skin/residue rules don't apply — use the app-adapted direction blocks.

## References (load as needed)

- [references/framework.md](references/framework.md) — formats, beat tables, single-prompt + chunked skeletons, per-chunk breakdowns, brand-input variables.
- [references/direction-blocks.md](references/direction-blocks.md) — the four direction blocks, physical + app-adapted.
- [references/libraries.md](references/libraries.md) — hook frameworks, universal reframe, soft-CTA bank, caption templates, variation types, avatar-prompt template + demographic spread.
- [references/qa-checklist.md](references/qa-checklist.md) — failure-mode lint + testing/scaling (kill vs scale) rules.
