"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { motion, useInView, useAnimationFrame } from "framer-motion";
import { startSession } from "@/lib/api";
import { ALLOWED_ROLES, type Role } from "@/lib/types";

/* ─── orbital node data ─── */
const ORBIT_NODES = [
  { label: "React", angle: 0,   orbit: 1, color: "#61DAFB", icon: "⚛" },
  { label: "Python", angle: 72,  orbit: 1, color: "#3B82F6", icon: "🐍" },
  { label: "System Design", angle: 144, orbit: 1, color: "#8B5CF6", icon: "🏗" },
  { label: "SQL", angle: 216, orbit: 1, color: "#10B981", icon: "🗄" },
  { label: "TypeScript", angle: 288, orbit: 1, color: "#F59E0B", icon: "TS" },
  { label: "Infra", angle: 30,  orbit: 2, color: "#EC4899", icon: "☁" },
  { label: "APIs", angle: 105, orbit: 2, color: "#6366F1", icon: "🔌" },
  { label: "DSA", angle: 190, orbit: 2, color: "#14B8A6", icon: "∑" },
  { label: "Security", angle: 265, orbit: 2, color: "#F97316", icon: "🔒" },
];

const FEATURES = [
  {
    icon: "adaptive",
    title: "Adaptive difficulty",
    body: "Questions get harder when you're crushing it, easier when you're stuck. The system reads your performance and recalibrates in real time.",
  },
  {
    icon: "score",
    title: "Real-time scoring",
    body: "Each answer scored 1–10 with keyword-level feedback before the next question. Know exactly what you nailed and what you missed.",
  },
  {
    icon: "report",
    title: "Skill gap report",
    body: "Final radar chart, weak areas flagged, and a 2-week learning roadmap personalized to your performance.",
  },
];

/* ─── Orbital canvas ─── */
function OrbitalRing() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const angleRef = useRef(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const W = canvas.width;
    const H = canvas.height;
    const cx = W / 2;
    const cy = H / 2;
    const R1 = W * 0.26;
    const R2 = W * 0.38;

    function draw(t: number) {
      ctx.clearRect(0, 0, W, H);

      /* glow core */
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, R1 * 0.5);
      grad.addColorStop(0, "rgba(99,102,241,0.18)");
      grad.addColorStop(1, "rgba(99,102,241,0)");
      ctx.beginPath();
      ctx.arc(cx, cy, R1 * 0.5, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      /* rings */
      [R1, R2].forEach((r) => {
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(165,180,252,0.12)";
        ctx.lineWidth = 1;
        ctx.stroke();
      });

      /* centre label */
      ctx.font = "700 28px 'Syne', sans-serif";
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("8 Qs", cx, cy - 10);
      ctx.font = "400 11px 'Syne', sans-serif";
      ctx.fillStyle = "rgba(165,180,252,0.7)";
      ctx.fillText("ADAPTIVE", cx, cy + 14);

      /* nodes */
      ORBIT_NODES.forEach((node) => {
        const speed = node.orbit === 1 ? 0.18 : -0.12;
        const rad = ((node.angle + t * speed) * Math.PI) / 180;
        const r = node.orbit === 1 ? R1 : R2;
        const nx = cx + Math.cos(rad) * r;
        const ny = cy + Math.sin(rad) * r;

        /* connector line */
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(nx, ny);
        ctx.strokeStyle = "rgba(99,102,241,0.08)";
        ctx.lineWidth = 0.5;
        ctx.stroke();

        /* bubble */
        const size = node.orbit === 1 ? 26 : 22;
        const bubbleGrad = ctx.createRadialGradient(nx - 3, ny - 3, 0, nx, ny, size);
        bubbleGrad.addColorStop(0, node.color + "55");
        bubbleGrad.addColorStop(1, node.color + "18");
        ctx.beginPath();
        ctx.arc(nx, ny, size, 0, Math.PI * 2);
        ctx.fillStyle = bubbleGrad;
        ctx.fill();
        ctx.strokeStyle = node.color + "66";
        ctx.lineWidth = 1;
        ctx.stroke();

        /* outer glow pulse */
        const pulse = 0.4 + 0.25 * Math.sin(t * 0.05 + node.angle);
        ctx.beginPath();
        ctx.arc(nx, ny, size + 6 * pulse, 0, Math.PI * 2);
        ctx.strokeStyle = node.color + "22";
        ctx.lineWidth = 1;
        ctx.stroke();

        /* icon/text */
        ctx.font = node.icon.length > 2 ? "600 9px 'Syne', sans-serif" : "14px sans-serif";
        ctx.fillStyle = node.color;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(node.icon, nx, ny);
      });
    }

    let frame = 0;
    function loop() {
      frame++;
      draw(frame);
      rafRef.current = requestAnimationFrame(loop);
    }
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={520}
      height={520}
      className="w-full max-w-[520px] aspect-square"
      style={{ filter: "drop-shadow(0 0 60px rgba(99,102,241,0.25))" }}
    />
  );
}

/* ─── Floating stat pill ─── */
function FloatingPill({
  label,
  value,
  delay,
  className,
}: {
  label: string;
  value: string;
  delay: number;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ delay, duration: 0.6, ease: [0.25, 1, 0.5, 1] }}
      className={`absolute glass rounded-2xl px-4 py-2.5 backdrop-blur-xl border border-white/10 ${className}`}
      style={{
        background: "rgba(20,18,40,0.7)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(165,180,252,0.12) inset",
      }}
    >
      <motion.div
        animate={{ y: [0, -5, 0] }}
        transition={{ duration: 3.5 + delay, repeat: Infinity, ease: "easeInOut" }}
      >
        <div className="text-[10px] uppercase tracking-[0.2em] text-[#a5b4fc]/60 font-mono mb-0.5">
          {label}
        </div>
        <div className="text-white font-semibold text-sm">{value}</div>
      </motion.div>
    </motion.div>
  );
}

/* ─── Ticker ─── */
const COMPANIES = [
  "Google", "Meta", "Amazon", "Apple", "Netflix",
  "Stripe", "Figma", "Notion", "Vercel", "Linear",
  "Airbnb", "Uber", "SpaceX", "OpenAI", "Anthropic",
];

function Ticker() {
  return (
    <div className="relative overflow-hidden py-3 before:absolute before:left-0 before:top-0 before:h-full before:w-24 before:bg-gradient-to-r before:from-[#0a0814] before:to-transparent before:z-10 after:absolute after:right-0 after:top-0 after:h-full after:w-24 after:bg-gradient-to-l after:from-[#0a0814] after:to-transparent after:z-10">
      <motion.div
        animate={{ x: ["0%", "-50%"] }}
        transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
        className="flex gap-10 whitespace-nowrap"
      >
        {[...COMPANIES, ...COMPANIES].map((c, i) => (
          <span key={i} className="text-[11px] uppercase tracking-[0.25em] text-[#5a5a6e] font-mono">
            {c}
          </span>
        ))}
      </motion.div>
    </div>
  );
}

/* ─── Main page ─── */
export default function HomePage() {
  const router = useRouter();
  const [role, setRole] = useState<Role>(ALLOWED_ROLES[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([]);

  const featuresRef = useRef<HTMLDivElement>(null);
  const featuresInView = useInView(featuresRef, { once: true, margin: "-100px" });

  async function handleStart(e: React.MouseEvent<HTMLButtonElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const id = Date.now();
    setRipples((r) => [...r, { id, x: e.clientX - rect.left, y: e.clientY - rect.top }]);
    setTimeout(() => setRipples((r) => r.filter((rp) => rp.id !== id)), 700);

    setLoading(true);
    setError(null);
    try {
      const res = await startSession(role);
      sessionStorage.setItem(
        `plumo:firstQuestion:${res.session_id}`,
        JSON.stringify(res.question),
      );
      router.push(`/interview/${res.session_id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not start session";
      setError(message);
      setLoading(false);
    }
  }

  function scrollToFeatures() {
    featuresRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <main className="flex flex-col flex-1 overflow-hidden">
      {/* ────────── HERO ────────── */}
      <section className="relative min-h-screen flex items-center px-6 pt-24 pb-20">

        {/* BG ambient blobs */}
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <motion.div
            animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0.8, 0.5] }}
            transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
            className="absolute -top-40 -left-40 w-[700px] h-[700px] rounded-full"
            style={{
              background: "radial-gradient(circle, rgba(99,102,241,0.22) 0%, transparent 65%)",
              filter: "blur(60px)",
            }}
          />
          <motion.div
            animate={{ scale: [1, 1.1, 1], opacity: [0.3, 0.55, 0.3] }}
            transition={{ duration: 14, repeat: Infinity, ease: "easeInOut", delay: 3 }}
            className="absolute bottom-0 right-0 w-[600px] h-[600px] rounded-full"
            style={{
              background: "radial-gradient(circle, rgba(139,92,246,0.2) 0%, transparent 65%)",
              filter: "blur(60px)",
            }}
          />
          {/* grid lines */}
          <div
            className="absolute inset-0 opacity-[0.025]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(165,180,252,1) 1px, transparent 1px), linear-gradient(90deg, rgba(165,180,252,1) 1px, transparent 1px)",
              backgroundSize: "60px 60px",
            }}
          />
        </div>

        <div className="relative max-w-7xl mx-auto w-full grid lg:grid-cols-2 gap-16 items-center">

          {/* ── LEFT: copy + CTA ── */}
          <div className="flex flex-col">
            {/* badge */}
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: [0.25, 1, 0.5, 1] }}
              className="badge-shimmer self-start inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-1.5 backdrop-blur-md mb-8"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
              </span>
              <span className="text-xs uppercase tracking-[0.18em] text-white/70 font-medium">
                AI-Powered Interview Coach
              </span>
            </motion.div>

            {/* headline */}
            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, delay: 0.1, ease: [0.25, 1, 0.5, 1] }}
              className="text-5xl lg:text-6xl xl:text-[4.5rem] font-semibold tracking-tight leading-[0.93] mb-7"
            >
              <span className="block gradient-text">Your AI</span>
              <span className="block gradient-text">Interviewer.</span>
              <span className="block mt-3 text-3xl lg:text-4xl font-normal text-[#8b8b9e]">
                Brutally Honest.{" "}
                <span className="text-[#c4b5fd]">Relentlessly</span> Helpful.
              </span>
            </motion.h1>

            {/* subtext */}
            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.4, ease: "easeOut" }}
              className="text-base text-[#8b8b9e] leading-relaxed max-w-md mb-10"
            >
              Eight adaptive questions. Real-time scoring. A skill gap report
              that tells you exactly where you stand —{" "}
              <span className="text-[#c4b5fd]">before</span> the real interview does.
            </motion.p>

            {/* stats row */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
              className="flex gap-6 mb-10"
            >
              {[
                { n: "20k+", l: "interviews completed" },
                { n: "94%", l: "offer rate improvement" },
                { n: "8", l: "adaptive questions" },
              ].map((s) => (
                <div key={s.n}>
                  <div className="text-2xl font-semibold gradient-text">{s.n}</div>
                  <div className="text-[11px] text-[#5a5a6e] font-mono uppercase tracking-wider">{s.l}</div>
                </div>
              ))}
            </motion.div>

            {/* role picker */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.7, ease: "easeOut" }}
              className="flex flex-col gap-4"
            >
              <span className="text-[10px] uppercase tracking-[0.22em] text-[#5a5a6e] font-mono">
                Pick your role
              </span>
              <div className="flex flex-wrap gap-2">
                {ALLOWED_ROLES.map((r, i) => {
                  const selected = role === r;
                  return (
                    <motion.button
                      key={r}
                      type="button"
                      onClick={() => setRole(r)}
                      disabled={loading}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, delay: 0.85 + i * 0.05 }}
                      whileHover={{ scale: 1.04, y: -1 }}
                      whileTap={{ scale: 0.97 }}
                      className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200
                        ${selected
                          ? "bg-gradient-to-r from-[#6366f1] to-[#818cf8] text-white border border-[#a5b4fc]/40"
                          : "bg-white/[0.03] text-[#c4c4d4] border border-white/10 hover:border-[#6366f1]/40 hover:bg-white/[0.06] hover:text-white"
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                      style={selected ? { boxShadow: "0 0 24px -4px rgba(99,102,241,0.55), 0 0 0 1px rgba(165,180,252,0.4) inset" } : undefined}
                    >
                      {r}
                    </motion.button>
                  );
                })}
              </div>

              {/* CTA */}
              <div className="flex items-center gap-4 mt-2">
                <motion.button
                  onClick={handleStart}
                  disabled={loading}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.98 }}
                  className="pulse-glow relative overflow-hidden inline-flex items-center gap-3 px-9 py-4 rounded-full bg-gradient-to-r from-[#6366f1] via-[#818cf8] to-[#6366f1] bg-[length:200%_100%] text-white font-semibold text-base hover:bg-[position:100%_0] transition-[background-position] duration-700 disabled:opacity-70 disabled:cursor-wait"
                >
                  {ripples.map((rp) => (
                    <span
                      key={rp.id}
                      className="absolute pointer-events-none"
                      style={{
                        left: rp.x, top: rp.y, width: 0, height: 0, borderRadius: "50%",
                        transform: "translate(-50%,-50%)",
                        animation: "ripple 0.7s ease-out forwards",
                        background: "rgba(255,255,255,0.4)",
                      }}
                    />
                  ))}
                  <style jsx>{`@keyframes ripple { to { width:600px;height:600px;opacity:0; } }`}</style>
                  {loading ? (
                    <><Spinner /><span>Starting…</span></>
                  ) : (
                    <><span>Start the Interview</span><ArrowIcon /></>
                  )}
                </motion.button>

                <motion.button
                  onClick={scrollToFeatures}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1.2 }}
                  className="text-sm text-[#8b8b9e] hover:text-white transition-colors flex items-center gap-1.5 group"
                >
                  How it works
                  <span className="group-hover:translate-y-0.5 transition-transform">↓</span>
                </motion.button>
              </div>

              {error && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="max-w-md px-4 py-3 rounded-lg border border-rose-500/30 bg-rose-950/40 text-rose-200 text-sm backdrop-blur-md"
                  role="alert"
                >
                  {error}
                </motion.div>
              )}
            </motion.div>
          </div>

          {/* ── RIGHT: orbital visual ── */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1.1, delay: 0.3, ease: [0.25, 1, 0.5, 1] }}
            className="relative flex items-center justify-center"
          >
            <OrbitalRing />

            {/* floating pills */}
            <FloatingPill label="Last score" value="8.4 / 10" delay={1.2} className="-top-4 right-4 lg:-right-8" />
            <FloatingPill label="Difficulty" value="↑ Hard" delay={1.5} className="bottom-16 -left-4 lg:-left-12" />
            <FloatingPill label="Next session" value="DSA Prep" delay={1.8} className="bottom-0 right-6 lg:right-0" />
          </motion.div>
        </div>

        {/* company ticker */}
        <div className="absolute bottom-0 left-0 right-0 border-t border-white/5">
          <div className="max-w-7xl mx-auto px-6 py-2">
            <span className="text-[9px] uppercase tracking-[0.3em] text-[#3a3a4e] font-mono mr-6">
              Engineers from
            </span>
          </div>
          <Ticker />
        </div>
      </section>

      {/* ────────── FEATURES ────────── */}
      <section ref={featuresRef} className="px-6 py-28 relative">
        {/* section bg glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background: "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(99,102,241,0.06) 0%, transparent 70%)",
          }}
        />

        <div className="max-w-6xl mx-auto relative">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={featuresInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.7 }}
            className="text-center mb-20"
          >
            <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-[#a5b4fc] font-mono mb-5">
              <span className="w-12 h-px bg-gradient-to-r from-transparent to-[#6366f1]" />
              How it works
              <span className="w-12 h-px bg-gradient-to-l from-transparent to-[#6366f1]" />
            </div>
            <h2 className="text-3xl md:text-5xl font-semibold tracking-tight gradient-text">
              Three engines under the hood.
            </h2>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 30, scale: 0.96 }}
                animate={featuresInView ? { opacity: 1, y: 0, scale: 1 } : {}}
                transition={{ duration: 0.7, delay: i * 0.1, ease: [0.25, 1, 0.5, 1] }}
                whileHover={{ y: -5, scale: 1.02 }}
                className="group glass rounded-2xl p-8 transition-all duration-300 hover:border-[#6366f1]/30 hover:shadow-[0_24px_60px_-20px_rgba(99,102,241,0.45)] relative overflow-hidden"
              >
                {/* subtle top accent bar */}
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#6366f1]/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-[#6366f1]/20 to-[#8b5cf6]/10 border border-[#6366f1]/25 text-[#a5b4fc] transition-transform duration-300 group-hover:scale-110 group-hover:rotate-[-6deg]">
                  <FeatureIcon name={f.icon} />
                </div>
                <h3 className="text-white text-lg font-semibold mb-3">{f.title}</h3>
                <p className="text-sm text-[#8b8b9e] leading-relaxed">{f.body}</p>
                <div className="mt-6 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                <div className="mt-4 flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] font-mono text-[#5a5a6e] group-hover:text-[#a5b4fc] transition-colors duration-300">
                  <span>0{i + 1}</span>
                  <span className="flex-1 h-px bg-white/5 group-hover:bg-[#6366f1]/20 transition-colors duration-300" />
                  <span>{["Adaptive", "Real-time", "Personal"][i]}</span>
                </div>
              </motion.div>
            ))}
          </div>

          {/* bottom CTA */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={featuresInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.7, delay: 0.4 }}
            className="mt-16 flex justify-center"
          >
            <div className="glass rounded-2xl px-8 py-6 flex flex-col md:flex-row items-center gap-6 max-w-2xl w-full">
              <div className="flex-1 text-center md:text-left">
                <div className="text-white font-semibold mb-1">Ready to know where you really stand?</div>
                <div className="text-sm text-[#8b8b9e]">Takes 15 minutes. No fluff. Pure signal.</div>
              </div>
              <motion.button
                onClick={scrollToFeatures}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.97 }}
                className="shrink-0 px-7 py-3 rounded-full bg-white/[0.06] border border-white/10 text-white text-sm font-medium hover:bg-white/[0.1] hover:border-[#6366f1]/40 transition-all"
                onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
              >
                Back to top ↑
              </motion.button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ────────── FOOTER ────────── */}
      <footer className="px-6 py-8 border-t border-white/5 mt-auto">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3 text-xs text-[#5a5a6e] font-mono">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
            <span>System operational</span>
          </div>
          <div>Built with Vertex AI · Gemini 2.5 Pro</div>
        </div>
      </footer>
    </main>
  );
}

/* ─── icon helpers ─── */
function FeatureIcon({ name }: { name: string }) {
  const p = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (name === "adaptive") return <svg {...p}><path d="M3 17 L9 11 L13 15 L21 7" /><path d="M15 7 L21 7 L21 13" /></svg>;
  if (name === "score") return <svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7 V12 L15 14" /></svg>;
  return <svg {...p}><path d="M4 20 V8 L12 4 L20 8 V20" /><path d="M9 20 V13 H15 V20" /></svg>;
}
function ArrowIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12 H19 M13 6 L19 12 L13 18" /></svg>;
}
function Spinner() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className="animate-spin"><path d="M21 12 a9 9 0 1 1 -9 -9" /></svg>;
}