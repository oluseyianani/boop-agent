// UGC brief → Seedance prompt composer.
//
// The winning Seedance pattern is NOT a voluminous scene description — it's a
// short, directive brief: a verbatim voiceover line, a mood, the actor's
// blocking, one camera move, and where the app footage ([Video1]) appears,
// closed with "natural light, iPhone quality". The bank stores each brief as
// structured fields; this renders them into that exact shape.
//
// Reference clips are attached to the model separately (they become [Video1],
// [Video2]… in order). The brief's own text references those tokens; the
// composer UI shows which stored clip maps to which token.

export interface UgcBrief {
  id: string;
  label?: string;
  viralReferenceId?: string; // the teardown this brief was drafted from
  referenceClips?: string[]; // clipIds, in [Video1], [Video2]… order
  scene?: string; // "her bedroom, natural light"
  actorBlocking?: string; // "sitting on her bed, scrolling her phone"
  camera?: string; // "hard cut to over-the-shoulder"
  appMoment?: string; // "[Video1] showing on her phone"
  voiceover?: string; // verbatim, rendered in quotes
  mood?: string; // "neutral" | "excited" | …
}

// The Creative Director pack stored on an idea (contentIdeas.creative JSON).
export interface CreativePack {
  ugcBriefs?: UgcBrief[];
  assets?: string[];
}

function sentence(s?: string): string {
  const t = (s ?? "").trim().replace(/\s+/g, " ");
  if (!t) return "";
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

export function composeUgcPrompt(brief: UgcBrief): string {
  const parts: string[] = [];

  const vo = (brief.voiceover ?? "").trim();
  parts.push(
    vo
      ? `Create a UGC-style video with voiceover "${vo}".`
      : "Create a UGC-style video.",
  );

  const mood = (brief.mood ?? "").trim();
  if (mood) parts.push(`Mood should be ${mood}.`);

  // Scene direction, in shot order: setting → actor → camera → app moment.
  for (const field of [brief.scene, brief.actorBlocking, brief.camera, brief.appMoment]) {
    const s = sentence(field);
    if (s) parts.push(s);
  }

  parts.push("Natural light, iPhone quality.");
  return parts.join(" ");
}

// True once a brief has enough to render something worth sending.
export function isBriefRenderable(brief: UgcBrief): boolean {
  return Boolean((brief.voiceover ?? "").trim() || (brief.scene ?? "").trim());
}
