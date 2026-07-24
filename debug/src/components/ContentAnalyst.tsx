import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api.js";
import {
  EmptyState,
  bodyTextClass,
  mutedTextClass,
  panelCardClass,
  subtlePanelClass,
} from "./PanelPrimitives.js";

// Analyst views — the old dashboard's charts rebuilt from Convex: follower
// growth (snapshots), competitor benchmark (pulled posts), and the weekly
// generated-vs-posted series (slot history).

interface Snapshot {
  followers: number | null;
  at: number;
}

interface PostRow {
  ownerHandle: string;
  type?: string;
  score: number;
  views?: number;
  postedAt?: number;
  url?: string;
}

interface ProfileRow {
  handle: string;
  followers?: number;
  source?: string;
}

interface SlotHistoryRow {
  slotDate: string;
  postedAt?: number;
}

const full = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("en-GB");

export function AnalystSection({
  isDark,
  projectId,
  ownHandle,
  competitors,
}: {
  isDark: boolean;
  projectId: string;
  ownHandle: string;
  competitors: { handle: string; why?: string }[];
}) {
  const own = ownHandle.toLowerCase();
  const history = useQuery(api.content.followerHistory, { projectId, handle: own }) as
    | Snapshot[]
    | undefined;
  const profiles = useQuery(api.content.listProfiles, { projectId }) as
    | ProfileRow[]
    | undefined;
  const myPosts = useQuery(api.content.listPosts, { projectId, ownerHandle: own }) as
    | PostRow[]
    | undefined;
  const compPosts = useQuery(api.content.postsForHandles, {
    projectId,
    handles: competitors.map((c) => c.handle),
  }) as PostRow[] | undefined;
  const slotHistory = useQuery(api.content.recentSlots, { projectId, limit: 500 }) as
    | SlotHistoryRow[]
    | undefined;

  const points = useMemo(
    () => (history ?? []).filter((h) => h.followers != null) as { followers: number; at: number }[],
    [history],
  );
  const followers = points.at(-1)?.followers ?? null;
  const delta = points.length >= 2 ? followers! - points[0].followers : null;

  const benchmark = useMemo(() => {
    const byHandle = new Map<string, PostRow[]>();
    for (const p of compPosts ?? []) {
      const list = byHandle.get(p.ownerHandle) ?? [];
      list.push(p);
      byHandle.set(p.ownerHandle, list);
    }
    return competitors.map((c) => {
      const posts = (byHandle.get(c.handle.toLowerCase()) ?? []).sort((a, b) => b.score - a.score);
      const top = posts.slice(0, 10);
      const avgTopScore = top.length
        ? Math.round(top.reduce((s, p) => s + p.score, 0) / top.length)
        : null;
      const videoShare = posts.length
        ? Math.round((posts.filter((p) => p.type === "Video").length / posts.length) * 100)
        : null;
      const ts = posts.map((p) => p.postedAt).filter(Boolean) as number[];
      const spanWeeks =
        ts.length >= 2 ? Math.max((Math.max(...ts) - Math.min(...ts)) / (7 * 864e5), 1) : null;
      const profile = (profiles ?? []).find((p) => p.handle === c.handle.toLowerCase());
      return {
        handle: c.handle,
        why: c.why,
        followers: profile?.followers ?? null,
        avgTopScore,
        videoShare,
        postsPerWeek: spanWeeks ? Math.round((posts.length / spanWeeks) * 10) / 10 : null,
        postCount: posts.length,
      };
    });
  }, [competitors, compPosts, profiles]);

  const weekly = useMemo(() => {
    const map = new Map<string, { planned: number; posted: number }>();
    for (const s of slotHistory ?? []) {
      const d = new Date(s.slotDate + "T00:00");
      d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // back to Monday
      const wk = d.toISOString().slice(0, 10);
      const w = map.get(wk) ?? { planned: 0, posted: 0 };
      w.planned++;
      if (s.postedAt) w.posted++;
      map.set(wk, w);
    }
    return [...map.entries()]
      .map(([weekStart, v]) => ({ weekStart, ...v }))
      .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
      .slice(-8);
  }, [slotHistory]);

  const totalViews = (myPosts ?? []).reduce((s, p) => s + (p.views ?? 0), 0);
  const topPost = myPosts?.[0];

  return (
    <section className={panelCardClass(isDark, "p-4")}>
      <h3 className="text-sm font-medium">Analyst</h3>
      <p className={`mt-0.5 text-xs ${mutedTextClass(isDark)}`}>
        Follower growth, where you stand in the niche, and generated vs posted.
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div className={subtlePanelClass(isDark, "p-3")}>
          <div className={`text-[11px] ${mutedTextClass(isDark)}`}>Followers</div>
          <div className={`text-lg font-semibold mono ${bodyTextClass(isDark)}`}>
            {full(followers)}
            {delta != null && delta !== 0 && (
              <span className={`ml-2 text-xs ${delta > 0 ? "text-emerald-500" : "text-rose-400"}`}>
                {delta > 0 ? "+" : ""}
                {delta}
              </span>
            )}
          </div>
          {points.length >= 2 && <Sparkline points={points} isDark={isDark} />}
        </div>
        <div className={subtlePanelClass(isDark, "p-3")}>
          <div className={`text-[11px] ${mutedTextClass(isDark)}`}>Top post score</div>
          <div className={`text-lg font-semibold mono ${bodyTextClass(isDark)}`}>
            {full(topPost?.score)}
          </div>
          <div className={`mt-0.5 text-[11px] ${mutedTextClass(isDark)}`}>
            {topPost?.views != null ? "views" : "likes + comments"} · {myPosts?.length ?? 0} posts pulled
          </div>
        </div>
        <div className={subtlePanelClass(isDark, "p-3")}>
          <div className={`text-[11px] ${mutedTextClass(isDark)}`}>Total views</div>
          <div className={`text-lg font-semibold mono ${bodyTextClass(isDark)}`}>
            {full(totalViews)}
          </div>
        </div>
      </div>

      <h4 className={`mb-1.5 mt-4 text-[11px] font-medium uppercase tracking-[0.08em] ${mutedTextClass(isDark)}`}>
        Where you stand in the niche
      </h4>
      {!benchmark.some((b) => b.postCount > 0 || b.followers != null) ? (
        <EmptyState isDark={isDark}>No competitor data pulled yet.</EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className={mutedTextClass(isDark)}>
                <th className="pb-2 pr-3 font-medium">Creator</th>
                <th className="pb-2 pr-3 font-medium">Followers</th>
                <th className="pb-2 pr-3 font-medium">Avg top score</th>
                <th className="pb-2 pr-3 font-medium">Video share</th>
                <th className="pb-2 font-medium">Posts/week</th>
              </tr>
            </thead>
            <tbody className={bodyTextClass(isDark)}>
              {benchmark.map((b) => (
                <tr key={b.handle} className={`border-t ${isDark ? "border-white/5" : "border-zinc-100"}`}>
                  <td className="py-1.5 pr-3">
                    <span className="mono">@{b.handle}</span>
                    {b.why && (
                      <div className={`text-[10px] ${mutedTextClass(isDark)}`}>{b.why}</div>
                    )}
                  </td>
                  <td className="py-1.5 pr-3 mono">{full(b.followers)}</td>
                  <td className="py-1.5 pr-3 mono">{full(b.avgTopScore)}</td>
                  <td className="py-1.5 pr-3 mono">{b.videoShare != null ? `${b.videoShare}%` : "—"}</td>
                  <td className="py-1.5 mono">{b.postsPerWeek ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {weekly.length > 0 && (
        <>
          <h4 className={`mb-1.5 mt-4 text-[11px] font-medium uppercase tracking-[0.08em] ${mutedTextClass(isDark)}`}>
            Generated vs posted, by week
          </h4>
          <div className="flex items-end gap-2" style={{ height: 90 }}>
            {weekly.map((w) => {
              const max = Math.max(...weekly.map((x) => x.planned), 1);
              return (
                <div key={w.weekStart} className="flex flex-1 flex-col items-center gap-1">
                  <div className="flex h-full w-full max-w-[48px] items-end justify-center gap-1">
                    <div
                      title={`${w.planned} planned`}
                      className={`w-3 rounded-t ${isDark ? "bg-white/15" : "bg-zinc-300"}`}
                      style={{ height: `${(w.planned / max) * 100}%` }}
                    />
                    <div
                      title={`${w.posted} posted`}
                      className="w-3 rounded-t bg-emerald-500"
                      style={{ height: `${(w.posted / max) * 100}%` }}
                    />
                  </div>
                  <span className={`text-[9px] mono ${mutedTextClass(isDark)}`}>
                    {w.weekStart.slice(5)}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

function Sparkline({ points, isDark }: { points: { followers: number; at: number }[]; isDark: boolean }) {
  const w = 160;
  const h = 28;
  const min = Math.min(...points.map((p) => p.followers));
  const max = Math.max(...points.map((p) => p.followers));
  const span = Math.max(max - min, 1);
  const path = points
    .map((p, i) => {
      const x = (i / Math.max(points.length - 1, 1)) * w;
      const y = h - ((p.followers - min) / span) * (h - 4) - 2;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg width={w} height={h} className="mt-1.5" aria-hidden>
      <path d={path} fill="none" stroke="#10b981" strokeWidth="1.5" />
    </svg>
  );
}
