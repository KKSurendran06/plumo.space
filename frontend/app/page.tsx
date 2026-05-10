"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { startSession } from "@/lib/api";
import { ALLOWED_ROLES, type Role } from "@/lib/types";

const FEATURES = [
  {
    title: "Adaptive difficulty",
    body: "Questions get harder when you're crushing it, easier when you're stuck.",
  },
  {
    title: "Real-time scoring",
    body: "Each answer scored 1-10 with keyword-level feedback before the next question.",
  },
  {
    title: "Skill gap report",
    body: "Final radar chart, weak areas flagged, and a 2-week learning roadmap.",
  },
];

export default function HomePage() {
  const router = useRouter();
  const [role, setRole] = useState<Role>(ALLOWED_ROLES[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleStart() {
    setLoading(true);
    setError(null);
    try {
      const res = await startSession(role);
      sessionStorage.setItem(
        `plumo:firstQuestion:${res.session_id}`,
        JSON.stringify(res.question),
      );
      router.push(`/interview/${res.session_id}`);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not start session";
      setError(message);
      setLoading(false);
    }
  }

  return (
    <main className="flex flex-col flex-1 min-h-screen">
      <div className="flex flex-col items-center justify-center flex-1 px-6 pt-24 pb-16">
        <h1
          className="text-6xl md:text-8xl font-mono tracking-tight text-white"
          style={{ letterSpacing: "-0.04em" }}
        >
          plumo
        </h1>
        <p className="mt-6 max-w-xl text-center text-[#888] text-base md:text-lg">
          AI-powered interview simulator. Real questions. Real feedback.
        </p>

        <div className="mt-14 w-full max-w-md flex flex-col gap-4">
          <label className="text-xs uppercase tracking-widest text-[#666]">
            Pick a role
          </label>
          <div className="relative">
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              disabled={loading}
              className="
                w-full appearance-none
                bg-[#0f0f0f] border border-[#222]
                text-white px-4 py-4
                focus:outline-none focus:border-[#444]
                disabled:opacity-50
              "
            >
              {ALLOWED_ROLES.map((r) => (
                <option key={r} value={r} className="bg-[#0f0f0f]">
                  {r}
                </option>
              ))}
            </select>
            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-[#666]">
              ▾
            </div>
          </div>

          <button
            onClick={handleStart}
            disabled={loading}
            className="
              mt-2 w-full bg-white text-black font-medium
              py-4 hover:bg-[#e0e0e0] transition-colors
              disabled:opacity-50 disabled:cursor-wait
            "
          >
            {loading ? "Starting interview…" : "Start Interview"}
          </button>

          {error && (
            <div
              className="mt-2 px-4 py-3 border border-red-900/50 bg-red-950/40 text-red-300 text-sm"
              role="alert"
            >
              {error}
            </div>
          )}
        </div>
      </div>

      <section className="border-t border-[#1a1a1a] px-6 py-16">
        <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-10">
          {FEATURES.map((f) => (
            <div key={f.title} className="flex gap-4">
              <div className="text-[#444] font-mono text-xs mt-1">▸</div>
              <div>
                <h3 className="text-white font-medium mb-1">{f.title}</h3>
                <p className="text-sm text-[#888] leading-relaxed">{f.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <footer className="px-6 py-6 text-center text-xs text-[#444] border-t border-[#1a1a1a]">
        Built with Vertex AI
      </footer>
    </main>
  );
}
