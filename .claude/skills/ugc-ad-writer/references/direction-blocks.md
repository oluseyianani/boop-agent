# The four direction blocks

Use the **physical-product** wording for creams/devices/cleaning/etc., and the **app/software** wording when the "product" is an app shown on a phone.

**CRITICAL — negations backfire in video generation.** These blocks are written with "no ___" phrasing for readability, but a video model renders whatever noun you name and ignores the "no" (write "no fake buttons" and it renders buttons). So:

- **Single-prompt:** fine to include all four — the product appears in that one video anyway.
- **Chunked:** do NOT paste the **B-Roll Sequencing block** (§3) or the **Interaction block** (§2) into product-free chunks — their product/phone words make the model render the product in a shot that should have none (this is the classic "a phone appears in the hook" failure). The **universal block** pasted into every chunk carries ONLY the Authenticity (§1) + UGC-Realism (§4) blocks + character/setting/lighting + the avatar instruction — all product-free. The Interaction block rides only in the chunks where the product appears, phrased positively. Product timing is enforced by **omission** (attach the asset only in its chunk), never by "must not appear" text.

---

## 1. Authenticity block

Locks the creator visually into the *after* condition the viewer is being shown the path to.

**Physical product (skin variant; adapt noun for hair/teeth/home):**
> Important skin direction: The creator has naturally beautiful, smooth, clear skin with an even tone and a soft healthy glow. Her complexion is clean and radiant throughout the entire video — no visible [CONDITION THE PRODUCT TREATS] at any point. She has the kind of skin that looks like she has already been using the product for months, because she has. This applies to every talking-to-camera scene, every product application scene, and every close-up.

Adaptations: hair → "healthy, full hair with no visible [thinning/breakage/frizz]"; teeth → "bright, white teeth with no visible [staining/yellowing]"; home → "clean, lived-in, beautiful — no visible [stains/clutter/damage]".

**App / software variant:**
> Important authenticity direction: The creator looks calm, capable, and genuinely relieved throughout — the kind of person who has already solved this problem, because she has. No stress, confusion, or frustration on her face at any point, including talking-to-camera and every phone/screen close-up. She reads as a real user sharing something that worked, not an actor performing a demo.

---

## 2. Interaction block

Name the failure mode the AI defaults to and override it.

**Physical product (application variant):**
> Important application direction: When the creator [USES THE PRODUCT], it should [DESIRED VISUAL BEHAVIOR]. No visible [FAILURE MODES THE AI DEFAULTS TO]. [WHAT IT SHOULD LOOK LIKE INSTEAD]. Her [TARGET AREA] should look exactly the same after use as before — [DESCRIPTION] — with only [REALISTIC RESIDUAL EFFECT] where the product touched.

**App / software variant:**
> Important app-interaction direction: When the creator uses the app, the phone screen shows exactly the reference element provided — real UI, real numbers, real motion. No invented interface, no fake buttons, no gibberish text, no warped or floating phone. Her taps and scrolls line up naturally with what is happening on screen. The phone is held or propped at a believable angle with a slight natural screen glare, not a pasted-on rectangle.

---

## 3. B-roll sequencing block

Ties product visibility to a specific lyric in the voiceover, not vague timing.

> Important b-roll sequencing: The product must not appear on screen until the voiceover specifically introduces it. During the hook and reframe beats, the camera stays on the creator. No environmental cutaways, no decorative shots of the apartment, no shots of furniture or art. The product is only revealed visually at the exact moment the voiceover names it.

In chunked mode this is a hard lock: **simply omit the `@asset` reference from any chunk where the product should not appear** — the AI cannot override an asset it was never given.

---

## 4. UGC realism block

> Important UGC realism direction: This is a casually filmed video. The phone is propped somewhere off-camera, so both her hands are free throughout. Natural handheld jitter and small micro-movements give it a self-filmed feel. She gestures naturally with both hands as she talks — adjusting her hair, touching her face when relevant, doing small open-palm gestures, shifting weight between her feet. She is never frozen in a still pose with her hands in her pockets or behind her back. The energy is "I just want to tell you something" not "I am posing for a commercial."

---

## Camera & b-roll standards (apply alongside the blocks)

- **Constant motion:** every shot moves. Talking-to-camera = natural handheld jitter; hands-free = subtle drift/micro-push-in; b-roll = tracking, dolly push, orbit, reveal, hand motion. No locked-off product photography, no still talking heads.
- **Visual-to-VO sync:** every visual matches the exact word being said. Says "fridge," show a fridge. Visuals follow the VO word for word.
- **Motivated cuts only.** Cut when: the creator physically moves to do something, the VO names the product (cut to reveal), or a scripted action happens. Never cut for decorative environment, "visual breaths," or aesthetic/cinematography moments — UGC has no cinematic establishing shots.
- **Normal speed.** No slow motion, no sped-up footage. Micro-cuts can be rapid on high-energy beats, slower on explanatory/emotional beats.
- **Scene discipline:** mid-funnel 2 scenes (3 only if VO requires), full stack 3.
- **Bookend** the first and last chunk (same setting/framing) to mask mid-chunk drift.
