# Framework: formats, beats, skeletons

## Format selection

| Attribute | Full Stack | Mid-Funnel Punchy |
|---|---|---|
| Runtime | 28–32 sec | 18–22 sec |
| Word count | 150–180 words | 55–70 words |
| Beats | 5: hook, reframe, mechanism, payoff, CTA | 3: sharp hook (reframe folded in), mechanism+analogy, soft payoff+close |
| Default scenes | 3 | 2 (3 only if VO needs it) |
| Chunks (chunked mode) | 5 | 3 |
| `@asset` pattern | NO / NO / NO / YES / NO | NO / YES / NO |
| Use for | Cold audiences needing the full education arc | Warmer audiences who know the problem, need a fast credibility signal |

**Animated Infomercial** (a variation, not a funnel stage): no creator, pure product/app cinematography + VO. Mid runtime 3–4 chunks, full 5–6. `@asset` = YES on every chunk (product/app is the hero). Fields become "cinematography direction" (orbit, dolly, macro, animated cutaway, hero shot) + "aesthetic continuity" (lighting temp, grade, materials).

## Beat structures

### Full Stack — 5 beats
1. **Hook** (0:00–0:03, two sentences) — call out the exact person, confirm the specific frustration. Repel everyone else.
2. **Problem Reframe** (0:03–0:10) — reveal the hidden mechanism behind why past attempts failed. Shift "I'm doing it wrong" → "I was given the wrong tools."
3. **Mechanism + Analogy** (0:10–0:20) — introduce product, explain mechanism in plain language + the one-second tactile analogy.
4. **Payoff** (0:20–0:25) — sensory, specific lived experience after the product. Visual and immediate, not abstract benefits.
5. **CTA** (0:25–0:30) — soft, suggestion-style close.

### Mid-Funnel Punchy — 3 beats
1. **Sharp Hook w/ Reframe folded in** (0:00–0:06) — one sentence that calls out the audience and dismisses the wrong assumption in the same breath.
2. **Mechanism with Analogy** (0:06–0:16) — compressed mechanism + the tactile analogy (the analogy stays intact at all costs).
3. **Soft Payoff + Close** (0:16–0:21) — one sensory beat + suggestion CTA.

## Voice rules (apply to every VO)

- Hook owns the first five words: identify the person + confirm the frustration. Never narrate the creator's morning/weekend/life.
- Sentence flow, not choppy fragments. WRONG: `"No chemicals. No scents. No replacing."` RIGHT: `"There are no chemicals, no scents, and nothing to replace ever again."`
- Keep the mechanism simple (12-year-old test). Always pair it with the tactile analogy — it is the most important sentence.
- **No em dashes, no bolding in voiceover.** Use commas, periods, short connectors.
- Avoid words AI voiceover mispronounces (collagen, hyaluronic, niacinamide, odd brand spellings). Swap them, or add a phonetic note. If the brand name is spoken, include a pronunciation lock (spelling + dictionary phonetics + "no shortcuts"). If it's still mispronounced, drop brand mentions from VO.

## Single-prompt skeleton (`single_prompt` mode)

Fill variables, keep order, no meta-commentary. For apps, swap the app-adapted direction blocks and reference the app-screen element where `@asset` appears.

```
Create a [STYLE] ad for [PRODUCT/APP CATEGORY]. The creator is a
[GENDER] in their [AGE RANGE], [VIBE — 2 to 3 words],
[HAIR DESCRIPTION], wearing [OUTFIT]. Natural look, [MAKEUP LEVEL].
They're in [SETTING WITH LIGHTING].

[AUTHENTICITY / SKIN DIRECTION BLOCK]
[APPLICATION / APP-INTERACTION DIRECTION BLOCK]

@[asset] is [PRODUCT NAME / the app screen], [what it is]. Use it as a
reference for how the [package / phone screen] looks when held or
interacted with, not as a static image.

[B-ROLL SEQUENCING BLOCK]
[UGC REALISM DIRECTION BLOCK]

Camera style: [CAMERA DIRECTION].
[B-ROLL DIRECTION WITH EXPLICIT NO-PRODUCT OPENING CUTS]
[SCENE COUNT AND PACING NOTE]

Here's the full script:
"[VOICEOVER SCRIPT]"
```

## Chunked skeleton (`chunked` mode)

Paste into every chunk: the **character lock** + the **four direction blocks**. Then one entry per voiceover line with the per-chunk fields below.

**Per-chunk fields:** chunk # + beat label · exact VO line (verbatim) · runtime (sec) · `@asset` included? (per pattern) · visual direction (angle, gesture timing, what the creator does) · continuity notes (what must match the prior chunk: outfit, hair, setting, lighting, position).

### Mid-Funnel 3-chunk breakdown (18–22s, 55–70w)
- **C1 — Hook+Reframe** · 5–7s · `@asset` **NO** · talking-to-camera, both hands free, gestures on key words, no cutaways, no product. Establishes baseline all chunks reference.
- **C2 — Mechanism+Product Reveal** · 8–10s · `@asset` **YES** (appears the instant VO names it) · cut to new angle motivated by movement (walk to counter), phone propped, steadier; quick interaction/application sequence; result close-up; no residue. Match C1 outfit/hair/lighting; product/screen matches reference exactly.
- **C3 — Payoff+Soft CTA** · 5–6s · `@asset` **NO** (close on face) · return to talking-to-camera bookending C1; genuine smile on payoff; subtle downward gesture on CTA.

### Full Stack 5-chunk breakdown (28–32s, 150–180w)
- **C1 — Hook** · 5–6s · **NO** · two sentences, talking-to-camera, steady eye contact, no cuts. Baseline lock.
- **C2 — Reframe pt 1** · 5–6s · **NO** · names the wrong things tried; slight angle shift/drift; dismissive gesture. Feels like one continuous take.
- **C3 — Reframe pt 2 (structural truth)** · 5–6s · **NO** · why surface attempts physically can't work; hook tension peaks; no cutaways. *(Easiest chunk to drop — can fold onto end of C2.)*
- **C4 — Mechanism+Reveal+Application** · 8–10s · **YES** (first appearance) · product named, mechanism explained plainly, analogy lands (the money line); cut motivated by movement; tight product shot, reveal on the naming word, macro interaction, push-in on result; no residue. *(Hardest to regenerate — budget extra time.)*
- **C5 — Payoff+Soft CTA** · 5–6s · **NO** (close on face) · sensory life-after + suggestion close; bookend C1 framing; earned smile.

**Stitching:** natural seam at the NO→YES reveal boundary. Bookend first + last chunk (same setting/framing) so mid-chunk inconsistencies read as natural cuts. Keep a droppable fallback chunk identified.

## Brand input variables

Collect before writing. **Do not invent values.** Required unless noted.

- Brand name + exact spelling
- Brand pronunciation (dictionary phonetics) — *required if spoken*
- Is the brand name spoken in VO? (yes/no)
- Product/app name + exact spelling
- Product/app pronunciation — *required if spoken*
- Product/app category
- Core mechanism in plain language (12-year-old-simple)
- Tactile analogy — `"Think of it less like ___ and more like ___"`
- Failed alternatives the audience has tried
- Target avatar demographics
- Specific pain points beyond the surface complaint — *required for deep angles*
- Setting + lighting preferences — *optional (defaults to lived-in home)*
- Reference asset (product image, or the app-screen element) — used where `@asset` appears
- Words AI mispronounces in this category — *optional, flag to swap*

## Pain-point ladder

Start campaigns on the **surface complaint** (visible symptom), then expand to **deep pain points**: public-visibility pain, the mental tax, the aging/time pain, the "I've fixed everything else" pain, intimacy/close-up pain, the recognition pain. Apply the **mass-desire filter**: the best pain points cut across age, gender, profession, lifestyle. Narrow-demographic pain points limit reach.
