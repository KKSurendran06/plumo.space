"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from "recharts";
import { getReport } from "@/lib/api";
import type { ReportResponse, RoadmapWeek } from "@/lib/types";

export default function ReportPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [report, setReport] = useState<ReportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getReport(sessionId);
        if (!cancelled) setReport(data);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load report");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  return (
    <main className="flex flex-col flex-1 min-h-screen relative">
      {report && <ConfettiBurst />}

      <header className="sticky top-0 z-20 backdrop-blur-xl bg-[#0a0a0f]/70 border-b border-white/5">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-4">
          <div className="flex items-center gap-2 font-mono text-sm">
            <span className="w-2 h-2 rounded-full bg-[#6366f1] shadow-[0_0_10px_rgba(99,102,241,0.8)]" />
            <span className="text-white tracking-tight">plumo</span>
            <span className="text-[#5a5a6e]">/</span>
            <span className="text-[#8b8b9e]">report</span>
          </div>
          <div className="flex-1" />
          <div className="hidden md:flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] font-mono text-[#5a5a6e]">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.7)]" />
            Session complete
          </div>
        </div>
      </header>

      <div className="flex-1 max-w-6xl w-full mx-auto px-6 py-12 flex flex-col gap-10">
        {error ? (
          <ErrorBanner message={error} />
        ) : !report ? (
          <ReportSkeleton />
        ) : (
          <>
            <ReportHero scores={report.skill_scores} />
            <RadarSection scores={report.skill_scores} />
            <WeakAreasBanner areas={report.weak_areas} />
            <ScoreBreakdown scores={report.skill_scores} />
            <RoadmapSection roadmap={report.roadmap} />

            <div className="pt-6 border-t border-white/5 flex flex-col items-center gap-3">
              <span className="text-[10px] uppercase tracking-[0.22em] font-mono text-[#5a5a6e]">
                Ready for round two?
              </span>
              <Link
                href="/"
                className="
                  pulse-glow inline-flex items-center gap-2
                  px-8 py-3 rounded-full
                  bg-gradient-to-r from-[#6366f1] via-[#818cf8] to-[#6366f1]
                  bg-[length:200%_100%]
                  hover:bg-[position:100%_0]
                  text-white font-semibold
                  transition-[background-position] duration-700
                "
              >
                Try another role
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M5 12 H19 M13 6 L19 12 L13 18" />
                </svg>
              </Link>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────

function ReportHero({ scores }: { scores: Record<string, number> }) {
  const overall = useMemo(() => {
    const vals = Object.values(scores);
    if (!vals.length) return 0;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }, [scores]);

  const display = useCountUp(overall, 1600);
  const pct = Math.max(0, Math.min(overall, 10)) / 10;
  const radius = 90;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct);

  const verdict =
    overall >= 8
      ? { label: "Stellar performance", tint: "text-emerald-300", color: "#10b981" }
      : overall >= 6
        ? { label: "Solid showing", tint: "text-[#a5b4fc]", color: "#6366f1" }
        : overall >= 4
          ? { label: "Real gaps to close", tint: "text-amber-300", color: "#f59e0b" }
          : { label: "Lots of headroom", tint: "text-rose-300", color: "#f43f5e" };

  return (
    <section className="flex flex-col items-center text-center pt-4">
      <motion.div
        initial={{ y: -60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{
          type: "spring",
          stiffness: 130,
          damping: 14,
          delay: 0.1,
        }}
        className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-1.5 backdrop-blur-md"
      >
        <span className="text-[#a5b4fc]">✦</span>
        <span className="text-xs uppercase tracking-[0.22em] font-mono text-white/70">
          Interview Complete
        </span>
      </motion.div>

      <motion.h1
        initial={{ y: -40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{
          type: "spring",
          stiffness: 110,
          damping: 13,
          delay: 0.25,
        }}
        className="mt-6 text-4xl md:text-6xl font-semibold tracking-tight gradient-text"
      >
        Here&apos;s where you stand.
      </motion.h1>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.55, duration: 0.6 }}
        className={`mt-3 text-sm md:text-base ${verdict.tint}`}
      >
        {verdict.label}
      </motion.p>

      {/* Score ring */}
      <motion.div
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.45, duration: 0.7, ease: [0.25, 1, 0.5, 1] }}
        className="relative mt-10"
      >
        <div
          aria-hidden
          className="absolute inset-0 -m-12 rounded-full pointer-events-none"
          style={{
            background: `radial-gradient(circle, ${verdict.color}40 0%, transparent 65%)`,
            filter: "blur(30px)",
          }}
        />
        <svg
          width="220"
          height="220"
          viewBox="0 0 220 220"
          className="-rotate-90 relative"
        >
          <circle
            cx="110"
            cy="110"
            r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth="6"
          />
          <motion.circle
            cx="110"
            cy="110"
            r={radius}
            fill="none"
            stroke={`url(#ring-gradient)`}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1.6, ease: "easeOut", delay: 0.6 }}
            style={{ filter: `drop-shadow(0 0 16px ${verdict.color})` }}
          />
          <defs>
            <linearGradient id="ring-gradient" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#6366f1" />
              <stop offset="50%" stopColor={verdict.color} />
              <stop offset="100%" stopColor="#8b5cf6" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="flex items-baseline gap-1">
            <span className="font-mono text-[3.5rem] leading-none font-semibold text-white tabular-nums tracking-tight">
              {display.toFixed(1)}
            </span>
            <span className="font-mono text-2xl text-[#5a5a6e]">/10</span>
          </div>
          <span className="mt-1 text-[10px] uppercase tracking-[0.24em] font-mono text-[#8b8b9e]">
            Overall score
          </span>
        </div>
      </motion.div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────

function RadarSection({ scores }: { scores: Record<string, number> }) {
  const data = Object.entries(scores).map(([skill, score]) => ({
    skill,
    score,
    fullMark: 10,
  }));

  if (data.length === 0) {
    return (
      <div className="glass rounded-2xl p-8 text-center text-[#8b8b9e]">
        No skill scores recorded for this session.
      </div>
    );
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 30, scale: 0.97 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.8, ease: [0.25, 1, 0.5, 1] }}
      className="glass rounded-2xl p-6 md:p-8 relative overflow-hidden"
    >
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(99, 102, 241, 0.12) 0%, transparent 60%)",
        }}
      />
      <div className="relative flex items-center justify-between mb-6">
        <div>
          <div className="text-[10px] uppercase tracking-[0.22em] font-mono text-[#5a5a6e] mb-1">
            Skill profile
          </div>
          <h2 className="text-xl font-semibold text-white">Where your strengths live</h2>
        </div>
        <div className="hidden md:flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] font-mono text-[#8b8b9e]">
          <span className="w-2 h-2 rounded-sm bg-[#6366f1] shadow-[0_0_8px_rgba(99,102,241,0.7)]" />
          You
        </div>
      </div>
      <div className="relative w-full h-[460px]">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data} outerRadius="78%">
            <defs>
              <radialGradient id="radar-fill" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#a5b4fc" stopOpacity={0.6} />
                <stop offset="60%" stopColor="#6366f1" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#4338ca" stopOpacity={0.1} />
              </radialGradient>
            </defs>
            <PolarGrid stroke="rgba(255,255,255,0.08)" />
            <PolarAngleAxis
              dataKey="skill"
              tick={{ fill: "#c4b5fd", fontSize: 12, fontWeight: 500 }}
            />
            <PolarRadiusAxis
              angle={90}
              domain={[0, 10]}
              tick={{ fill: "rgba(255,255,255,0.25)", fontSize: 10 }}
              stroke="rgba(255,255,255,0.05)"
            />
            <Radar
              name="Score"
              dataKey="score"
              stroke="#818cf8"
              fill="url(#radar-fill)"
              fillOpacity={1}
              strokeWidth={2}
              isAnimationActive
              animationDuration={1500}
              animationEasing="ease-out"
              dot={{
                r: 4,
                fill: "#a5b4fc",
                stroke: "#6366f1",
                strokeWidth: 2,
              }}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </motion.section>
  );
}

// ─────────────────────────────────────────────────────────────────────

function WeakAreasBanner({ areas }: { areas: string[] }) {
  if (areas.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        className="glass rounded-2xl px-6 py-5 border-l-4 border-l-emerald-400/70 flex items-center gap-4"
      >
        <span className="w-10 h-10 rounded-full bg-emerald-500/15 border border-emerald-400/40 flex items-center justify-center text-emerald-300 shadow-[0_0_20px_-4px_rgba(16,185,129,0.5)]">
          ✓
        </span>
        <div>
          <div className="text-xs uppercase tracking-[0.22em] font-mono text-emerald-300 mb-0.5">
            Strong session
          </div>
          <span className="text-[#c4c4d4] text-sm">
            No major weak areas detected. Keep stretching with harder topics.
          </span>
        </div>
      </motion.div>
    );
  }
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      whileInView={{
        opacity: 1,
        x: [-8, 6, -4, 2, 0],
      }}
      viewport={{ once: true }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className="glass rounded-2xl px-6 py-5 relative overflow-hidden"
      style={{
        boxShadow:
          "inset 4px 0 0 0 rgba(244, 63, 94, 0.65), 0 0 30px -8px rgba(244, 63, 94, 0.4)",
      }}
    >
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at left, rgba(244, 63, 94, 0.15) 0%, transparent 60%)",
        }}
      />
      <div className="relative">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.22em] font-mono text-rose-300 mb-3">
          <span className="text-rose-400">⚠</span>
          Weak areas — focus here
        </div>
        <div className="flex flex-wrap gap-2">
          {areas.map((a, i) => (
            <motion.span
              key={a}
              initial={{ opacity: 0, scale: 0.85 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 + i * 0.08 }}
              className="text-sm px-3 py-1 rounded-full border border-rose-400/40 bg-rose-500/10 text-rose-200"
            >
              {a}
            </motion.span>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────

function ScoreBreakdown({ scores }: { scores: Record<string, number> }) {
  const entries = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return null;

  return (
    <section>
      <div className="flex items-baseline justify-between mb-5">
        <div>
          <div className="text-[10px] uppercase tracking-[0.22em] font-mono text-[#5a5a6e] mb-1">
            Score breakdown
          </div>
          <h2 className="text-xl font-semibold text-white">Skill by skill</h2>
        </div>
        <span className="text-xs font-mono text-[#5a5a6e]">
          {entries.length} dimension{entries.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {entries.map(([skill, score], i) => (
          <ScoreBar key={skill} skill={skill} score={score} index={i} />
        ))}
      </div>
    </section>
  );
}

function ScoreBar({
  skill,
  score,
  index,
}: {
  skill: string;
  score: number;
  index: number;
}) {
  const display = useCountUp(score, 1300);
  const pct = Math.max(0, Math.min(score, 10)) / 10;
  const color =
    score >= 8 ? "#10b981" : score >= 6 ? "#a5b4fc" : score >= 4 ? "#f59e0b" : "#f43f5e";
  const tint =
    score >= 8 ? "text-emerald-300" : score >= 6 ? "text-[#c4b5fd]" : score >= 4 ? "text-amber-300" : "text-rose-300";

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay: index * 0.06, ease: "easeOut" }}
      whileHover={{ y: -2 }}
      className="glass rounded-xl p-4 transition-shadow hover:shadow-[0_10px_30px_-10px_rgba(99,102,241,0.5)]"
    >
      <div className="flex items-baseline justify-between mb-3">
        <span className="text-sm text-[#e0e0ee] font-medium">{skill}</span>
        <span className={`font-mono text-lg font-semibold tabular-nums ${tint}`}>
          {display.toFixed(1)}
          <span className="text-[#5a5a6e] text-xs ml-0.5">/10</span>
        </span>
      </div>
      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{
            background: `linear-gradient(90deg, ${color}, ${color}dd)`,
            boxShadow: `0 0 12px -2px ${color}`,
          }}
          initial={{ width: 0 }}
          whileInView={{ width: `${pct * 100}%` }}
          viewport={{ once: true }}
          transition={{ duration: 1.2, delay: 0.2 + index * 0.06, ease: "easeOut" }}
        />
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────

function RoadmapSection({ roadmap }: { roadmap: RoadmapWeek[] }) {
  if (!roadmap || roadmap.length === 0) return null;

  const sorted = [...roadmap].sort((a, b) => a.week - b.week);

  return (
    <section>
      <div className="flex items-baseline justify-between mb-6">
        <div>
          <div className="text-[10px] uppercase tracking-[0.22em] font-mono text-[#5a5a6e] mb-1">
            Personalized plan
          </div>
          <h2 className="text-xl font-semibold text-white">
            Your 2-week climb
          </h2>
        </div>
        <span className="text-xs font-mono text-[#5a5a6e]">
          {sorted.length} week{sorted.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="relative pl-12 md:pl-16">
        {/* SVG line that draws itself */}
        <svg
          className="absolute left-4 md:left-6 top-2 bottom-2 w-0.5 overflow-visible pointer-events-none"
          aria-hidden
        >
          <motion.line
            x1="1"
            y1="0"
            x2="1"
            y2="100%"
            stroke="url(#timeline-grad)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray="2000"
            initial={{ strokeDashoffset: 2000 }}
            whileInView={{ strokeDashoffset: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 2.2, ease: "easeOut" }}
          />
          <defs>
            <linearGradient id="timeline-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6366f1" />
              <stop offset="50%" stopColor="#8b5cf6" />
              <stop offset="100%" stopColor="#22d3ee" />
            </linearGradient>
          </defs>
        </svg>

        <div className="flex flex-col gap-5">
          {sorted.map((w, i) => (
            <RoadmapCard key={w.week} week={w} delay={0.4 + i * 0.5} />
          ))}
        </div>
      </div>
    </section>
  );
}

function RoadmapCard({ week, delay }: { week: RoadmapWeek; delay: number }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, x: 30, scale: 0.96 }}
      whileInView={{ opacity: 1, x: 0, scale: 1 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.6, delay, ease: [0.25, 1, 0.5, 1] }}
      className="relative"
    >
      {/* Node on timeline */}
      <motion.span
        initial={{ scale: 0 }}
        whileInView={{ scale: 1 }}
        viewport={{ once: true }}
        transition={{
          delay: delay + 0.2,
          type: "spring",
          stiffness: 200,
          damping: 12,
        }}
        className="absolute left-[-2.4rem] md:left-[-3.4rem] top-5 w-7 h-7 rounded-full flex items-center justify-center bg-[#0a0a0f] border-2 border-[#6366f1] shadow-[0_0_18px_-2px_rgba(99,102,241,0.7)]"
      >
        <span className="text-[10px] font-mono font-bold text-[#a5b4fc]">
          {week.week}
        </span>
      </motion.span>

      <motion.div
        whileHover={{ y: -2 }}
        className="glass rounded-2xl p-5 md:p-6 transition-all hover:border-[#6366f1]/30 hover:shadow-[0_20px_50px_-20px_rgba(99,102,241,0.5)]"
      >
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="w-full text-left flex items-start justify-between gap-4 cursor-pointer"
          aria-expanded={expanded}
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] font-mono text-[#a5b4fc] mb-2">
              <span>Week {week.week}</span>
              <span className="w-6 h-px bg-[#6366f1]/40" />
              <span className="text-[#5a5a6e]">
                {week.resources.length} resource
                {week.resources.length === 1 ? "" : "s"}
              </span>
            </div>
            <h3 className="text-lg md:text-xl font-semibold text-white tracking-tight">
              {week.focus}
            </h3>
          </div>
          <motion.span
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ duration: 0.3 }}
            className="shrink-0 mt-1 text-[#8b8b9e]"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M6 9 L12 15 L18 9" />
            </svg>
          </motion.span>
        </button>

        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              key="resources"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.4, ease: [0.25, 1, 0.5, 1] }}
              className="overflow-hidden"
            >
              <div className="pt-5 mt-5 border-t border-white/5">
                <div className="text-[10px] uppercase tracking-[0.22em] font-mono text-[#5a5a6e] mb-3">
                  Resources
                </div>
                <ul className="flex flex-col gap-2">
                  {week.resources.map((r, i) => (
                    <motion.li
                      key={i}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.06 }}
                      className="flex items-start gap-3 text-sm text-[#c4c4d4]"
                    >
                      <span className="mt-1 w-1 h-1 rounded-full bg-[#6366f1] shadow-[0_0_6px_rgba(99,102,241,0.7)] shrink-0" />
                      {isUrl(r) ? (
                        <a
                          href={r}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-[#a5b4fc] hover:text-white hover:underline break-all transition-colors"
                        >
                          {r}
                        </a>
                      ) : (
                        <span>{r}</span>
                      )}
                    </motion.li>
                  ))}
                </ul>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {!expanded && (
          <div className="mt-4 text-[11px] uppercase tracking-[0.18em] font-mono text-[#5a5a6e] flex items-center gap-1.5">
            Tap to reveal resources
            <span>→</span>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

function isUrl(s: string): boolean {
  return /^https?:\/\//i.test(s);
}

// ─────────────────────────────────────────────────────────────────────

function ReportSkeleton() {
  return (
    <div className="flex flex-col gap-8 pt-12">
      <div className="flex flex-col items-center gap-4">
        <div className="skeleton-shimmer h-7 w-48" />
        <div className="skeleton-shimmer h-12 w-96 max-w-full" />
        <div className="skeleton-shimmer h-[220px] w-[220px] rounded-full" />
      </div>
      <div className="glass rounded-2xl p-6">
        <div className="skeleton-shimmer h-4 w-32 mb-4" />
        <div className="skeleton-shimmer h-[400px] w-full rounded-xl" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="skeleton-shimmer h-20 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="glass rounded-2xl px-6 py-5 border-l-4 border-l-rose-500/60 mt-12">
      <div className="text-xs uppercase tracking-[0.22em] font-mono text-rose-300 mb-1">
        Could not load report
      </div>
      <div className="text-sm text-[#c4c4d4]">{message}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────

function useCountUp(target: number, duration = 1200) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    const start = 0;
    const startTime = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min((t - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(start + (target - start) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return val;
}

// ─────────────────────────────────────────────────────────────────────
// Confetti burst — canvas-based, fades after ~1.8s
// ─────────────────────────────────────────────────────────────────────

function ConfettiBurst() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = window.innerWidth;
    let h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const colors = ["#6366f1", "#818cf8", "#a5b4fc", "#22d3ee", "#10b981", "#f59e0b", "#f43f5e"];

    type Piece = {
      x: number;
      y: number;
      vx: number;
      vy: number;
      r: number;
      rot: number;
      vrot: number;
      color: string;
      shape: "rect" | "circle";
      life: number;
    };

    const cx = w / 2;
    const cy = h * 0.42;
    const N = 180;
    const pieces: Piece[] = Array.from({ length: N }, () => {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 9 + 4;
      return {
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        r: Math.random() * 5 + 3,
        rot: Math.random() * Math.PI * 2,
        vrot: (Math.random() - 0.5) * 0.4,
        color: colors[Math.floor(Math.random() * colors.length)],
        shape: Math.random() > 0.5 ? "rect" : "circle",
        life: 1,
      };
    });

    const start = performance.now();
    const duration = 1800;
    let raf = 0;

    const tick = (t: number) => {
      const elapsed = t - start;
      const progress = Math.min(elapsed / duration, 1);
      ctx.clearRect(0, 0, w, h);

      for (const p of pieces) {
        p.vy += 0.18; // gravity
        p.vx *= 0.992;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vrot;
        p.life = 1 - progress;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 8;
        if (p.shape === "rect") {
          ctx.fillRect(-p.r, -p.r * 0.6, p.r * 2, p.r * 1.2);
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, p.r, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      if (elapsed < duration) {
        raf = requestAnimationFrame(tick);
      } else {
        ctx.clearRect(0, 0, w, h);
      }
    };

    raf = requestAnimationFrame(tick);

    const onResize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-30"
      aria-hidden
    />
  );
}
