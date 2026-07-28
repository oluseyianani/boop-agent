// Shared shapes for the content engine (fork-local, see CONTENT.md).

export interface ProjectConfig {
  name?: string;
  slug?: string;
  instagramHandle: string;
  knownPostUrls?: string[];
  pullTtlHours?: number;
  blockedRetryCooldownHours?: number;
  platforms?: string[];
  conceptsPerDay?: number;
  ideaCooldownDays?: number;
  competitors?: { handle: string; why?: string }[];
  accentColor?: string;
}

export interface BankIdea {
  id: string;
  title: string;
  enemy: string;
  failureMoment?: string;
  formats: string[];
  angle?: string;
  keywords?: string[];
  retired?: boolean;
}

export interface BankScript {
  ideaId: string;
  hooks: string[];
  beats?: { t?: string; beat: string }[];
  cta: string;
  ugcBrief?: string;
}

// One UGC video brief (Seedance). Rigid fields; rendered to a short directive
// prompt by the frontend composer. Mirrors debug/src/lib/contentPrompts.ts.
export interface UgcBrief {
  id: string;
  label?: string;
  referenceClips?: string[]; // clipIds, in [Video1], [Video2]… order
  scene?: string;
  actorBlocking?: string;
  camera?: string;
  appMoment?: string;
  voiceover?: string; // verbatim spoken copy
  mood?: string;
}

// The Creative Director pack stored per idea (contentIdeas.creative JSON).
// Replaced the faceless genPrompts model in the UGC rewrite.
export interface CreativePack {
  ugcBriefs?: UgcBrief[];
  assets?: string[];
}

export interface Bank {
  version?: number;
  updatedAt?: string;
  refreshedBy?: string;
  ideas: BankIdea[];
  scripts: BankScript[];
  creative?: Record<string, unknown>;
  dmPlaybook?: unknown[];
}

export interface StepResult {
  step: string;
  ok: boolean;
  detail: string;
}

export interface ContentProjectRow {
  projectId: string;
  name: string;
  config: string;
  dmPlaybook?: string;
  bankVersion?: number;
  bankRefreshedAt?: number;
}

export function parseConfig(row: ContentProjectRow): ProjectConfig {
  return JSON.parse(row.config) as ProjectConfig;
}

// Same normalization the old desk used for caption matching.
export function norm(s: unknown): string {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9£ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
