"use client";

import { useEffect, useRef } from "react";

/**
 * Cinematic background: drifting orbs + canvas starfield + noise + scanlines + vignette.
 * Sits behind all page content via z-index. Lives in the root layout.
 */
export function BackgroundFX() {
  return (
    <>
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        {/* Deep gradient base */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(67, 56, 202, 0.18) 0%, transparent 60%), radial-gradient(ellipse 70% 50% at 90% 100%, rgba(139, 92, 246, 0.12) 0%, transparent 55%), radial-gradient(ellipse 60% 40% at 10% 80%, rgba(34, 211, 238, 0.08) 0%, transparent 60%), #0a0a0f",
          }}
        />

        {/* Drifting orbs */}
        <div
          className="orb orb-indigo orb-anim-1"
          style={{ width: 520, height: 520, top: "-10%", left: "-8%" }}
        />
        <div
          className="orb orb-violet orb-anim-2"
          style={{ width: 440, height: 440, top: "35%", right: "-12%" }}
        />
        <div
          className="orb orb-blue orb-anim-3"
          style={{ width: 380, height: 380, bottom: "-12%", left: "30%" }}
        />
        <div
          className="orb orb-cyan orb-anim-1"
          style={{
            width: 280,
            height: 280,
            top: "60%",
            left: "5%",
            opacity: 0.35,
            animationDelay: "-8s",
          }}
        />

        <Starfield />
      </div>

      {/* Noise + scanline overlays sit above orbs but below content */}
      <div className="noise-overlay" />
      <div className="scanline-overlay" />
      <div className="vignette-overlay" />
    </>
  );
}

/**
 * Canvas-based drifting starfield. Hundreds of tiny points slowly drifting,
 * twinkling subtly. Pauses when tab is hidden.
 */
function Starfield() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let width = window.innerWidth;
    let height = window.innerHeight;

    type Star = {
      x: number;
      y: number;
      r: number;
      vx: number;
      vy: number;
      a: number;
      tw: number; // twinkle phase
      twSpeed: number;
      hue: number; // 0-1 mix between violet (0) and cyan (1)
    };

    let stars: Star[] = [];

    const init = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const count = Math.floor((width * height) / 7000); // density
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        r: Math.random() * 1.2 + 0.2,
        vx: (Math.random() - 0.5) * 0.06,
        vy: (Math.random() - 0.5) * 0.06,
        a: Math.random() * 0.5 + 0.2,
        tw: Math.random() * Math.PI * 2,
        twSpeed: Math.random() * 0.015 + 0.005,
        hue: Math.random(),
      }));
    };

    init();

    let raf = 0;
    let lastT = performance.now();
    let running = true;

    const tick = (t: number) => {
      if (!running) return;
      const dt = Math.min((t - lastT) / 16.67, 3);
      lastT = t;
      ctx.clearRect(0, 0, width, height);

      for (const s of stars) {
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.tw += s.twSpeed * dt;

        if (s.x < -2) s.x = width + 2;
        if (s.x > width + 2) s.x = -2;
        if (s.y < -2) s.y = height + 2;
        if (s.y > height + 2) s.y = -2;

        const tw = (Math.sin(s.tw) + 1) * 0.5;
        const alpha = s.a * (0.55 + tw * 0.45);

        // mix indigo→cyan
        const r = Math.round(165 + (34 - 165) * s.hue);
        const g = Math.round(180 + (211 - 180) * s.hue);
        const b = Math.round(252 + (238 - 252) * s.hue);

        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
        ctx.fill();

        // Brighter cores get a soft glow
        if (s.r > 0.95) {
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r * 3.5, 0, Math.PI * 2);
          const glow = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 3.5);
          glow.addColorStop(0, `rgba(${r},${g},${b},${alpha * 0.35})`);
          glow.addColorStop(1, `rgba(${r},${g},${b},0)`);
          ctx.fillStyle = glow;
          ctx.fill();
        }
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);

    const onResize = () => init();
    window.addEventListener("resize", onResize);

    const onVisibility = () => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(raf);
      } else if (!running) {
        running = true;
        lastT = performance.now();
        raf = requestAnimationFrame(tick);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      style={{ opacity: 0.85 }}
    />
  );
}
