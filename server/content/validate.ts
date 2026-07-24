// Deterministic doctrine validator for the content bank — TypeScript port of
// content-agent's validate-content.js. The LLM proposes; this code disposes.
// Sourced from the app repo's .specify/memory/copy-style.md (lexical tells)
// and marketing-positioning.md (one enemy per piece, allowed enemies).

import type { Bank } from "./types.js";

const BANNED_WORDS = [
  "delve", "tapestry", "testament", "boasts", "vibrant", "pivotal", "crucial",
  "meticulous", "meticulously", "intricate", "intricacies", "seamless",
  "seamlessly", "effortless", "effortlessly", "elevate", "empower",
  "supercharge", "streamline", "robust", "cutting-edge", "game-changer",
  "game-changing", "next-gen", "revolutionize", "revolutionise",
  "groundbreaking", "renowned", "nestled", "garner", "bolster", "bolstered",
  "foster", "fostering", "underscore", "underscores", "showcase", "showcasing",
  "moreover", "furthermore", "holistic", "synergy", "hassle-free", "one-stop",
  "world-class", "best-in-class", "unparalleled", "unrivaled",
];

const BANNED_PHRASES = [
  "it's important to note", "it is important to note", "it's worth noting",
  "in today's world", "in the heart of", "look no further",
  "we've got you covered", "to the next level", "unlock your", "unlock the",
  "elevate your", "transform your", "your journey", "dive in", "let's dive",
  "whether you're", "a testament to", "stands as", "serves as",
  "valuable insights", "evolving landscape", "more than just", "not just a",
  "rich history", "natural beauty", "diverse array", "smarter than ever",
];

export const ALLOWED_ENEMIES = [
  "Notes app", "WhatsApp thread", "bank balance glance",
  "mental math in the aisle", "the budget spreadsheet", "the receipt shoebox",
  "doing nothing", "bank app categories",
];

const ALLOWED_FORMATS = ["reel", "carousel", "image"];

const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;

// Claims the product can't cash (owner decision, July 2026: iOS only).
const FALSE_CLAIMS = [
  /ios and android/i, /android and ios/i, /\bon android\b(?!.{0,20}coming)/i,
  /both platforms/i, /android app\b/i, /google play/i, /play store/i,
];

const FACE_RE =
  /\b(face to camera|talking head|to-camera|smiles? at the camera|founder on camera|selfie video)\b/i;

function checkString(
  where: string,
  s: unknown,
  errors: string[],
  { allowLong = false } = {},
): void {
  if (typeof s !== "string" || !s.trim()) {
    errors.push(`${where}: empty or not a string`);
    return;
  }
  const lower = s.toLowerCase();
  for (const w of BANNED_WORDS) {
    if (new RegExp(`\\b${w.replace(/[-]/g, "[-\\s]?")}\\b`, "i").test(lower))
      errors.push(`${where}: banned word "${w}"`);
  }
  for (const p of BANNED_PHRASES) {
    if (lower.includes(p)) errors.push(`${where}: banned phrase "${p}"`);
  }
  if (EMOJI_RE.test(s)) errors.push(`${where}: contains emoji`);
  const emDashes = (s.match(/—/g) ?? []).length;
  if (emDashes > 1) errors.push(`${where}: ${emDashes} em dashes in one string (max 1)`);
  if (/not just .{1,40}?,? but\b/i.test(s) || /isn['’]t .{1,40}?[—-] it['’]s/i.test(s))
    errors.push(`${where}: negative parallelism ("not just X, but Y")`);
  for (const re of FALSE_CLAIMS) {
    if (re.test(s)) errors.push(`${where}: claims Android availability (iOS only today)`);
  }
  if (!allowLong && [...s].length > 400) errors.push(`${where}: over 400 chars`);
}

export function validateBank(bank: Bank): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!bank || typeof bank !== "object") return { ok: false, errors: ["bank is not an object"] };
  const ideas = bank.ideas ?? [];
  const scripts = bank.scripts ?? [];

  const active = ideas.filter((i) => !i.retired);
  if (active.length < 8 || active.length > 16)
    errors.push(`ideas: ${active.length} active (need 8–16)`);
  const ids = new Set<string>();
  for (const i of ideas) {
    const w = `idea ${i.id ?? "?"}`;
    if (!i.id || !/^[a-z0-9-]+$/.test(i.id)) errors.push(`${w}: bad or missing id`);
    if (ids.has(i.id)) errors.push(`${w}: duplicate id`);
    ids.add(i.id);
    if (!ALLOWED_ENEMIES.includes(i.enemy))
      errors.push(`${w}: enemy "${i.enemy}" not in the doctrine list`);
    if (
      !Array.isArray(i.formats) ||
      !i.formats.length ||
      i.formats.some((f) => !ALLOWED_FORMATS.includes(f))
    )
      errors.push(`${w}: formats must be a non-empty subset of ${ALLOWED_FORMATS.join("/")}`);
    if (!Array.isArray(i.keywords) || !i.keywords.length) errors.push(`${w}: keywords missing`);
    checkString(`${w} title`, i.title, errors);
    checkString(`${w} angle`, i.angle, errors);
    checkString(`${w} failureMoment`, i.failureMoment, errors);
  }

  const hookSeen = new Set<string>();
  for (const s of scripts) {
    const w = `script ${s.ideaId ?? "?"}`;
    if (!ids.has(s.ideaId)) errors.push(`${w}: no matching idea`);
    if (!Array.isArray(s.hooks) || s.hooks.length !== 3) errors.push(`${w}: needs exactly 3 hooks`);
    for (const [j, h] of (s.hooks ?? []).entries()) {
      checkString(`${w} hook ${"ABC"[j] ?? j}`, h, errors);
      const key = String(h).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      if (hookSeen.has(key)) errors.push(`${w}: duplicate hook "${String(h).slice(0, 40)}"`);
      hookSeen.add(key);
    }
    if (!Array.isArray(s.beats) || s.beats.length < 3 || s.beats.length > 5)
      errors.push(`${w}: needs 3–5 beats`);
    for (const b of s.beats ?? []) {
      checkString(`${w} beat ${b.t ?? "?"}`, b.beat, errors);
      if (FACE_RE.test(b.beat ?? "")) errors.push(`${w} beat ${b.t}: not faceless`);
    }
    checkString(`${w} cta`, s.cta, errors);
    checkString(`${w} ugcBrief`, s.ugcBrief, errors, { allowLong: true });
    if (FACE_RE.test(s.ugcBrief ?? "")) errors.push(`${w} ugcBrief: not faceless`);
  }

  for (const [ideaId, packUnknown] of Object.entries(bank.creative ?? {})) {
    const pack = packUnknown as {
      genPrompts?: { label?: string; prompt?: string }[];
      assets?: string[];
    };
    const w = `creative ${ideaId}`;
    if (!ids.has(ideaId)) errors.push(`${w}: no matching idea`);
    for (const g of pack.genPrompts ?? []) {
      checkString(`${w} prompt "${(g.label ?? "?").slice(0, 30)}"`, g.prompt, errors, {
        allowLong: true,
      });
      if (!/#08A00E/i.test(g.prompt ?? "")) errors.push(`${w} "${g.label}": missing brand green #08A00E`);
      if (!/no (people|faces)/i.test(g.prompt ?? ""))
        errors.push(`${w} "${g.label}": must state no people/faces`);
    }
    for (const a of pack.assets ?? []) checkString(`${w} asset`, a, errors);
  }

  const dm = (bank.dmPlaybook ?? []) as { intent?: string; reply?: string }[];
  for (const p of dm) checkString(`dm "${p.intent ?? "?"}" reply`, p.reply, errors);
  if (dm.length < 4) errors.push("dmPlaybook: fewer than 4 templates");

  return { ok: errors.length === 0, errors };
}
