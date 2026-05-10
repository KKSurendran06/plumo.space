"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
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
    <main className="flex flex-col min-h-screen">
      <div className="border-b border-[#1a1a1a] px-6 py-4 flex items-center">
        <div className="flex-1 font-mono text-sm text-white">plumo</div>
        <div className="text-xs uppercase tracking-widest text-[#666]">
          Final Report
        </div>
        <div className="flex-1" />
      </div>

      <div className="flex-1 max-w-5xl w-full mx-auto px-6 py-10 flex flex-col gap-10">
        {error ? (
          <ErrorBanner message={error} />
        ) : !report ? (
          <ReportSkeleton />
        ) : (
          <>
            <RadarSection scores={report.skill_scores} />
            <WeakAreasBanner areas={report.weak_areas} />
            <ScoreBreakdown scores={report.skill_scores} />
            <RoadmapSection roadmap={report.roadmap} />
          </>
        )}

        <div className="pt-4 border-t border-[#1a1a1a] flex justify-center">
          <Link
            href="/"
            className="bg-white text-black font-medium px-8 py-3 hover:bg-[#e0e0e0] transition-colors"
          >
            Start New Interview
          </Link>
        </div>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------

function RadarSection({ scores }: { scores: Record<string, number> }) {
  const data = Object.entries(scores).map(([skill, score]) => ({
    skill,
    score,
    fullMark: 10,
  }));

  if (data.length === 0) {
    return (
      <div className="border border-[#222] bg-[#0d0d0d] p-8 text-center text-[#666]">
        No skill scores recorded for this session.
      </div>
    );
  }

  return (
    <section className="border border-[#222] bg-[#0d0d0d] p-6">
      <h2 className="text-xs uppercase tracking-widest text-[#666] mb-4">
        Skill Profile
      </h2>
      <div className="w-full h-[420px]">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data} outerRadius="75%">
            <PolarGrid stroke="#222" />
            <PolarAngleAxis
              dataKey="skill"
              tick={{ fill: "#ccc", fontSize: 12 }}
            />
            <PolarRadiusAxis
              angle={90}
              domain={[0, 10]}
              tick={{ fill: "#444", fontSize: 10 }}
              stroke="#222"
            />
            <Radar
              name="Score"
              dataKey="score"
              stroke="#ffffff"
              fill="#ffffff"
              fillOpacity={0.18}
              strokeWidth={2}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function WeakAreasBanner({ areas }: { areas: string[] }) {
  if (areas.length === 0) {
    return (
      <div className="border border-green-900/40 bg-green-950/20 px-5 py-4">
        <span className="text-xs uppercase tracking-widest text-green-400 mr-3">
          Strong session
        </span>
        <span className="text-[#ccc] text-sm">
          No major weak areas detected. Keep stretching with harder topics.
        </span>
      </div>
    );
  }
  return (
    <div className="border border-red-900/40 bg-red-950/20 px-5 py-4">
      <div className="text-xs uppercase tracking-widest text-red-400 mb-2">
        Weak areas
      </div>
      <div className="flex flex-wrap gap-2">
        {areas.map((a) => (
          <span
            key={a}
            className="text-sm px-3 py-1 border border-red-900/50 text-red-300"
          >
            {a}
          </span>
        ))}
      </div>
    </div>
  );
}

function ScoreBreakdown({ scores }: { scores: Record<string, number> }) {
  const entries = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return null;
  return (
    <section>
      <h2 className="text-xs uppercase tracking-widest text-[#666] mb-3">
        Score breakdown
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {entries.map(([skill, score]) => {
          const color =
            score >= 8 ? "text-green-400" : score >= 6 ? "text-yellow-300" : "text-red-400";
          return (
            <div
              key={skill}
              className="border border-[#1a1a1a] bg-[#0c0c0c] px-4 py-3 flex items-baseline justify-between"
            >
              <span className="text-sm text-[#ccc]">{skill}</span>
              <span className={`font-mono text-lg ${color}`}>
                {score.toFixed(1)}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function RoadmapSection({ roadmap }: { roadmap: RoadmapWeek[] }) {
  if (!roadmap || roadmap.length === 0) return null;
  return (
    <section>
      <h2 className="text-xs uppercase tracking-widest text-[#666] mb-3">
        2-week learning roadmap
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {roadmap.map((w) => (
          <div
            key={w.week}
            className="border border-[#222] bg-[#0d0d0d] p-5 flex flex-col gap-3"
          >
            <div className="flex items-baseline gap-3">
              <span className="text-[#666] font-mono text-xs uppercase tracking-widest">
                Week {w.week}
              </span>
              <span className="text-white font-medium">{w.focus}</span>
            </div>
            <ul className="flex flex-col gap-1.5">
              {w.resources.map((r, i) => (
                <li key={i} className="text-sm text-[#ccc] flex items-start gap-2">
                  <span className="text-[#444] mt-0.5">▸</span>
                  {isUrl(r) ? (
                    <a
                      href={r}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:underline break-all"
                    >
                      {r}
                    </a>
                  ) : (
                    <span>{r}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function isUrl(s: string): boolean {
  return /^https?:\/\//i.test(s);
}

function ReportSkeleton() {
  return (
    <>
      <div className="border border-[#222] bg-[#0d0d0d] p-6">
        <div className="skeleton h-4 w-32 mb-4" />
        <div className="skeleton h-[380px] w-full" />
      </div>
      <div className="skeleton h-12 w-full" />
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="skeleton h-12 w-full" />
        ))}
      </div>
    </>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="border border-red-900/50 bg-red-950/40 text-red-300 px-5 py-4">
      <div className="text-xs uppercase tracking-widest mb-1">
        Could not load report
      </div>
      <div className="text-sm">{message}</div>
    </div>
  );
}
