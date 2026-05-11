"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  fetchSpeech,
  submitAnswer,
  transcribeAudio,
} from "@/lib/api";
import type {
  Difficulty,
  Evaluation,
  QuestionPayload,
} from "@/lib/types";

const TOTAL_TURNS = 8;

type MicState = "idle" | "requesting" | "recording" | "transcribing" | "unavailable";
type TtsState = "idle" | "loading" | "playing" | "failed";

export default function InterviewPage() {
  const params = useParams<{ sessionId: string }>();
  const router = useRouter();
  const sessionId = params.sessionId;

  const [question, setQuestion] = useState<QuestionPayload | null>(null);
  const [turnNumber, setTurnNumber] = useState(1);
  const [previousEval, setPreviousEval] = useState<Evaluation | null>(null);
  const [answer, setAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [micState, setMicState] = useState<MicState>("idle");
  const [voiceMessage, setVoiceMessage] = useState<string | null>(null);
  const [ttsState, setTtsState] = useState<TtsState>("idle");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);
  const ttsUrlRef = useRef<string | null>(null);

  // Load first question from sessionStorage on mount
  useEffect(() => {
    const cached = sessionStorage.getItem(`plumo:firstQuestion:${sessionId}`);
    if (!cached) {
      router.replace("/?error=session_expired");
      return;
    }
    try {
      const parsed = JSON.parse(cached) as QuestionPayload;
      setQuestion(parsed);
    } catch {
      router.replace("/?error=session_expired");
    }
  }, [sessionId, router]);

  // Speak the question on every change
  const playTts = useCallback(async (text: string) => {
    if (ttsAudioRef.current) {
      ttsAudioRef.current.pause();
      ttsAudioRef.current.src = "";
      ttsAudioRef.current = null;
    }
    if (ttsUrlRef.current) {
      URL.revokeObjectURL(ttsUrlRef.current);
      ttsUrlRef.current = null;
    }
    setTtsState("loading");
    try {
      const blob = await fetchSpeech(text);
      const url = URL.createObjectURL(blob);
      ttsUrlRef.current = url;
      const audio = new Audio(url);
      ttsAudioRef.current = audio;
      audio.onended = () => {
        setTtsState("idle");
        URL.revokeObjectURL(url);
        if (ttsUrlRef.current === url) ttsUrlRef.current = null;
      };
      audio.onerror = () => setTtsState("failed");
      await audio.play();
      setTtsState("playing");
    } catch {
      setTtsState("failed");
    }
  }, []);

  useEffect(() => {
    if (question?.question) {
      void playTts(question.question);
    }
  }, [question?.question, playTts]);

  useEffect(() => {
    return () => {
      audioStreamRef.current?.getTracks().forEach((t) => t.stop());
      if (ttsAudioRef.current) {
        ttsAudioRef.current.pause();
      }
      if (ttsUrlRef.current) {
        URL.revokeObjectURL(ttsUrlRef.current);
      }
    };
  }, []);

  async function startRecording() {
    if (micState === "unavailable") return;
    setMicState("requesting");
    setVoiceMessage(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
      audioChunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      mr.onstop = () => {
        void handleRecordingStopped();
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setMicState("recording");
    } catch {
      setMicState("unavailable");
      setVoiceMessage("Voice unavailable — type your answer below.");
    }
  }

  async function stopRecording() {
    const mr = mediaRecorderRef.current;
    if (!mr || mr.state === "inactive") return;
    mr.stop();
  }

  async function handleRecordingStopped() {
    setMicState("transcribing");
    audioStreamRef.current?.getTracks().forEach((t) => t.stop());
    audioStreamRef.current = null;

    const blob = new Blob(audioChunksRef.current, { type: "audio/webm;codecs=opus" });
    audioChunksRef.current = [];

    if (blob.size === 0) {
      setMicState("idle");
      return;
    }

    try {
      const transcript = await transcribeAudio(blob);
      setAnswer((prev) => (prev ? `${prev} ${transcript}` : transcript).trim());
      setMicState("idle");
    } catch {
      setMicState("unavailable");
      setVoiceMessage("Transcription failed — type your answer below.");
    }
  }

  async function handleSubmit() {
    if (!answer.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await submitAnswer(sessionId, answer.trim());
      if (res.done) {
        sessionStorage.removeItem(`plumo:firstQuestion:${sessionId}`);
        router.push(`/report/${sessionId}`);
        return;
      }
      setPreviousEval(res.evaluation);
      setQuestion(res.next_question);
      setTurnNumber(res.turn_number);
      setAnswer("");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not submit answer";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex flex-col flex-1 min-h-screen">
      <TopBar
        turn={turnNumber}
        total={TOTAL_TURNS}
      />

      <div className="flex-1 max-w-3xl w-full mx-auto px-6 py-8 flex flex-col gap-6">

        {/* TOP: previous evaluation */}
        <AnimatePresence>
          {previousEval && (
            <EvaluationCard
              key={`eval-${turnNumber}`}
              evaluation={previousEval}
            />
          )}
        </AnimatePresence>

        {/* MIDDLE: current question */}
        <AnimatePresence mode="wait">
          {question ? (
            <QuestionCard
              key={`${turnNumber}-${question.question.slice(0, 24)}`}
              question={question}
              turnNumber={turnNumber}
              ttsState={ttsState}
              onReplay={() => void playTts(question.question)}
            />
          ) : (
            <QuestionSkeleton key="skeleton" />
          )}
        </AnimatePresence>

        {/* BOTTOM: answer area */}
        <div className="flex flex-col gap-4">
          <AnswerArea
            value={answer}
            onChange={setAnswer}
            onSubmit={handleSubmit}
            submitting={submitting || !question}
            micState={micState}
            voiceMessage={voiceMessage}
            onMicClick={() => {
              if (micState === "recording") void stopRecording();
              else if (micState === "idle") void startRecording();
            }}
          />

          {error && (
            <motion.div
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              className="px-4 py-3 rounded-lg border border-rose-500/40 bg-rose-950/40 text-rose-200 text-sm backdrop-blur-md"
            >
              {error}
            </motion.div>
          )}
        </div>

      </div>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────

function TopBar({ turn, total }: { turn: number; total: number }) {
  const progress = (turn / total) * 100;
  return (
    <div className="sticky top-0 z-20 backdrop-blur-xl bg-[#0a0a0f]/70 border-b border-white/5">
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-6">
        <div className="flex items-center gap-2 font-mono text-sm">
          <span className="w-2 h-2 rounded-full bg-[#6366f1] shadow-[0_0_10px_rgba(99,102,241,0.8)]" />
          <span className="text-white tracking-tight">plumo</span>
          <span className="text-[#5a5a6e]">/</span>
          <span className="text-[#8b8b9e]">interview</span>
        </div>
        <div className="flex-1" />
        <div className="hidden md:flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] font-mono text-[#5a5a6e]">
          <span>Turn</span>
          <span className="text-white tabular-nums">{turn.toString().padStart(2, "0")}</span>
          <span>/</span>
          <span>{total.toString().padStart(2, "0")}</span>
        </div>
      </div>
      <div className="h-[2px] bg-white/5 relative overflow-hidden">
        <motion.div
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-[#6366f1] via-[#818cf8] to-[#22d3ee]"
          style={{ boxShadow: "0 0 16px rgba(99, 102, 241, 0.7)" }}
          initial={false}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.7, ease: [0.25, 1, 0.5, 1] }}
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────

function QuestionCard({
  question,
  turnNumber,
  ttsState,
  onReplay,
}: {
  question: QuestionPayload;
  turnNumber: number;
  ttsState: TtsState;
  onReplay: () => void;
}) {
  const text = question.question;
  const [typed, setTyped] = useState("");
  const [done, setDone] = useState(false);

  // Typewriter effect — restart each new question
  useEffect(() => {
    setTyped("");
    setDone(false);
    let i = 0;
    const speed = Math.max(14, Math.min(28, Math.floor(900 / text.length)));
    const id = setInterval(() => {
      i++;
      setTyped(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(id);
        setDone(true);
      }
    }, speed);
    return () => clearInterval(id);
  }, [text]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: -40, transition: { duration: 0.25 } }}
      transition={{ duration: 0.6, ease: [0.25, 1, 0.5, 1] }}
      className="glass rounded-2xl p-7 md:p-8 relative overflow-hidden"
    >
      {/* corner gradient */}
      <div
        aria-hidden
        className="absolute -top-32 -left-32 w-72 h-72 rounded-full pointer-events-none"
        style={{
          background:
            "radial-gradient(circle, rgba(99, 102, 241, 0.18) 0%, transparent 70%)",
        }}
      />

      <div className="relative">
        <div className="flex items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <span className="text-[10px] uppercase tracking-[0.22em] font-mono text-[#5a5a6e]">
              Question
            </span>
            <span className="font-mono text-sm text-white tabular-nums">
              {turnNumber.toString().padStart(2, "0")}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <DifficultyBadge difficulty={question.difficulty} />
            <SpeakerButton ttsState={ttsState} onClick={onReplay} />
          </div>
        </div>

        <p className="text-2xl md:text-[1.7rem] leading-[1.35] text-white font-medium tracking-tight">
          {typed}
          {!done && <span className="caret-blink text-[#a5b4fc] ml-0.5">▍</span>}
        </p>

        {/* Skill tags */}
        <div className="mt-7 flex flex-wrap gap-2">
          {question.skills_tested.map((s, i) => (
            <motion.span
              key={s}
              initial={{ opacity: 0, x: -16 }}
              animate={done ? { opacity: 1, x: 0 } : { opacity: 0, x: -16 }}
              transition={{ duration: 0.4, delay: i * 0.08, ease: "easeOut" }}
              className="text-[11px] px-3 py-1 rounded-full border border-[#6366f1]/30 bg-[#6366f1]/10 text-[#c4b5fd] uppercase tracking-[0.12em] font-mono"
            >
              {s}
            </motion.span>
          ))}
        </div>

        {ttsState === "failed" && (
          <p className="mt-5 text-xs text-[#8b8b9e] flex items-center gap-2">
            <span className="text-amber-400">⚠</span>
            Audio unavailable — read the question above.
          </p>
        )}
      </div>
    </motion.div>
  );
}

function QuestionSkeleton() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="glass rounded-2xl p-7 md:p-8"
    >
      <div className="flex items-center justify-between mb-6">
        <div className="skeleton-shimmer h-3 w-24" />
        <div className="skeleton-shimmer h-7 w-20" />
      </div>
      <div className="skeleton-shimmer h-7 w-full mb-3" />
      <div className="skeleton-shimmer h-7 w-5/6 mb-3" />
      <div className="skeleton-shimmer h-7 w-2/3" />
      <div className="mt-6 flex gap-2">
        <div className="skeleton-shimmer h-6 w-20" />
        <div className="skeleton-shimmer h-6 w-24" />
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────

function DifficultyBadge({ difficulty }: { difficulty: Difficulty }) {
  const config: Record<
    Difficulty,
    { label: string; classes: string; glow: string; dot: string }
  > = {
    easy: {
      label: "Easy",
      classes: "border-emerald-400/40 text-emerald-300 bg-emerald-500/10",
      glow: "diff-glow-easy",
      dot: "bg-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.8)]",
    },
    medium: {
      label: "Medium",
      classes: "border-amber-400/40 text-amber-300 bg-amber-500/10",
      glow: "diff-glow-medium",
      dot: "bg-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.8)]",
    },
    hard: {
      label: "Hard",
      classes: "border-rose-400/50 text-rose-300 bg-rose-500/10",
      glow: "diff-glow-hard",
      dot: "bg-rose-400 shadow-[0_0_12px_rgba(244,63,94,0.9)]",
    },
  };
  const c = config[difficulty];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] uppercase tracking-[0.18em] font-mono font-semibold ${c.classes} ${c.glow}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}

function SpeakerButton({
  ttsState,
  onClick,
}: {
  ttsState: TtsState;
  onClick: () => void;
}) {
  const playing = ttsState === "playing";
  const loading = ttsState === "loading";
  const label =
    ttsState === "playing"
      ? "Speaking…"
      : ttsState === "loading"
        ? "Loading audio…"
        : ttsState === "failed"
          ? "Replay (audio failed)"
          : "Hear question";

  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={loading}
      title={label}
      aria-label={label}
      whileHover={{ scale: 1.06 }}
      whileTap={{ scale: 0.94 }}
      className={`
        relative shrink-0 w-9 h-9 rounded-full flex items-center justify-center
        transition-all
        ${
          playing
            ? "bg-[#6366f1]/20 border border-[#6366f1]/50 text-[#a5b4fc]"
            : "bg-white/5 border border-white/10 text-[#c4c4d4] hover:bg-white/10 hover:text-white hover:border-[#6366f1]/40"
        }
        disabled:opacity-50 disabled:cursor-not-allowed
      `}
    >
      {playing && (
        <span
          aria-hidden
          className="absolute inset-0 rounded-full"
          style={{
            boxShadow: "0 0 0 0 rgba(99, 102, 241, 0.4)",
            animation: "pulse-glow 2s ease-in-out infinite",
          }}
        />
      )}
      <SpeakerIcon playing={playing} />
    </motion.button>
  );
}

function SpeakerIcon({ playing }: { playing: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      {playing && <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />}
      {playing && <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────

function EvaluationCard({ evaluation }: { evaluation: Evaluation }) {
  const score = evaluation.score;
  const ringColor =
    score >= 8 ? "#10b981" : score >= 5 ? "#f59e0b" : "#f43f5e";
  const textColor =
    score >= 8 ? "text-emerald-300" : score >= 5 ? "text-amber-300" : "text-rose-300";

  return (
    <motion.div
      initial={{ opacity: 0, y: -12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, transition: { duration: 0.2 } }}
      transition={{ duration: 0.6, ease: [0.25, 1, 0.5, 1] }}
      className="glass rounded-2xl p-6"
    >
      <div className="flex items-center gap-5 mb-4">
        <ScoreRing score={score} ringColor={ringColor} />
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-[0.22em] font-mono text-[#5a5a6e] mb-1">
            Previous answer
          </div>
          <div className={`text-sm font-medium ${textColor}`}>
            {score >= 8 ? "Strong" : score >= 5 ? "Adequate" : "Needs work"}
          </div>
        </div>
      </div>
      <p className="text-sm text-[#c4c4d4] leading-relaxed mb-4">
        {evaluation.feedback}
      </p>
      <div className="grid grid-cols-1 gap-3">
        <KeywordBlock title="Matched" color="emerald" words={evaluation.keywords_matched} />
        <KeywordBlock title="Missing" color="rose" words={evaluation.keywords_missing} />
      </div>
    </motion.div>
  );
}

function ScoreRing({
  score,
  ringColor,
}: {
  score: number;
  ringColor: string;
}) {
  const display = useCountUp(score, 1200);
  const pct = Math.max(0, Math.min(score, 10)) / 10;
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct);

  return (
    <div className="relative w-16 h-16 shrink-0">
      <svg
        viewBox="0 0 64 64"
        className="w-16 h-16 -rotate-90"
        aria-hidden
      >
        <circle
          cx="32"
          cy="32"
          r={radius}
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="4"
          fill="none"
        />
        <motion.circle
          cx="32"
          cy="32"
          r={radius}
          stroke={ringColor}
          strokeWidth="4"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.2, ease: "easeOut" }}
          style={{ filter: `drop-shadow(0 0 8px ${ringColor})` }}
        />
      </svg>
      <div className="absolute inset-0 flex items-baseline justify-center">
        <span className="mt-5 font-mono text-xl font-semibold text-white tabular-nums">
          {display.toFixed(0)}
        </span>
        <span className="font-mono text-xs text-[#5a5a6e]">/10</span>
      </div>
    </div>
  );
}

function useCountUp(target: number, duration = 1200) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    let start = 0;
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

function KeywordBlock({
  title,
  color,
  words,
}: {
  title: string;
  color: "emerald" | "rose";
  words: string[];
}) {
  const palette =
    color === "emerald"
      ? "border-emerald-400/30 text-emerald-300 bg-emerald-500/5"
      : "border-rose-400/30 text-rose-300 bg-rose-500/5";
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.22em] font-mono text-[#5a5a6e] mb-2">
        {title}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {words.length === 0 ? (
          <span className="text-[#5a5a6e] text-xs font-mono">—</span>
        ) : (
          words.map((w, i) => (
            <motion.span
              key={w}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.04 }}
              className={`text-xs px-2 py-0.5 rounded-md border ${palette}`}
            >
              {w}
            </motion.span>
          ))
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────

function AnswerArea({
  value,
  onChange,
  onSubmit,
  submitting,
  micState,
  voiceMessage,
  onMicClick,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  submitting: boolean;
  micState: MicState;
  voiceMessage: string | null;
  onMicClick: () => void;
}) {
  const recording = micState === "recording";
  const transcribing = micState === "transcribing";
  const requesting = micState === "requesting";
  const unavailable = micState === "unavailable";
  const [focused, setFocused] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.1, ease: [0.25, 1, 0.5, 1] }}
      className="glass rounded-2xl p-6 flex flex-col gap-4"
    >
      <div className="flex items-center gap-4">
        <MicButton
          recording={recording}
          requesting={requesting}
          transcribing={transcribing}
          unavailable={unavailable}
          onClick={onMicClick}
          disabled={submitting}
        />
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-[0.22em] font-mono text-[#5a5a6e] mb-0.5">
            Your answer
          </div>
          <div className="text-sm text-[#c4c4d4] truncate">
            {requesting && "Requesting microphone…"}
            {recording && "Recording — tap to stop"}
            {transcribing && "Transcribing your answer…"}
            {micState === "idle" && "Speak or type below"}
            {unavailable && (voiceMessage ?? "Voice unavailable — type below")}
          </div>
        </div>
      </div>

      <div className="relative">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Walk me through your thinking…"
          rows={7}
          disabled={submitting}
          className={`
            w-full bg-black/30 border rounded-xl
            text-white p-4 resize-y
            focus:outline-none
            placeholder:text-[#5a5a6e]
            font-sans text-base leading-relaxed
            transition-all duration-200
            ${
              focused
                ? "border-[#6366f1]/60 shadow-[0_0_0_3px_rgba(99,102,241,0.12),0_0_30px_-10px_rgba(99,102,241,0.5)]"
                : "border-white/10 hover:border-white/20"
            }
          `}
        />
        <div className="absolute bottom-3 right-3 text-[10px] uppercase tracking-[0.18em] font-mono text-[#5a5a6e]">
          {value.length} chars
        </div>
      </div>

      <SubmitButton
        onSubmit={onSubmit}
        disabled={!value.trim() || submitting}
        submitting={submitting}
      />
    </motion.div>
  );
}

function MicButton({
  recording,
  requesting,
  transcribing,
  unavailable,
  onClick,
  disabled,
}: {
  recording: boolean;
  requesting: boolean;
  transcribing: boolean;
  unavailable: boolean;
  onClick: () => void;
  disabled: boolean;
}) {
  const baseDisabled = unavailable || transcribing || requesting || disabled;

  return (
    <motion.button
      onClick={onClick}
      disabled={baseDisabled}
      whileHover={!baseDisabled ? { scale: 1.06 } : undefined}
      whileTap={!baseDisabled ? { scale: 0.92 } : undefined}
      aria-label={recording ? "Stop recording" : "Start recording"}
      className={`
        relative w-14 h-14 rounded-full flex items-center justify-center
        shrink-0 transition-all
        ${
          recording
            ? "bg-rose-500/20 border border-rose-400/50 text-rose-300"
            : unavailable
              ? "bg-white/5 border border-white/10 text-[#5a5a6e]"
              : "bg-[#6366f1]/15 border border-[#6366f1]/40 text-[#a5b4fc] hover:bg-[#6366f1]/25"
        }
        disabled:cursor-not-allowed
      `}
      style={
        recording
          ? {
              boxShadow:
                "0 0 0 1px rgba(244, 63, 94, 0.5), 0 0 28px -4px rgba(244, 63, 94, 0.7)",
            }
          : !unavailable
            ? {
                boxShadow:
                  "0 0 0 1px rgba(99, 102, 241, 0.3), 0 0 24px -6px rgba(99, 102, 241, 0.55)",
              }
            : undefined
      }
    >
      {recording && (
        <>
          <span
            aria-hidden
            className="absolute inset-0 rounded-full border border-rose-400/60 pulse-ring-red"
          />
          <span
            aria-hidden
            className="absolute inset-0 rounded-full border border-rose-400/40 pulse-ring-red"
            style={{ animationDelay: "0.7s" }}
          />
        </>
      )}
      {transcribing ? (
        <Spinner />
      ) : recording ? (
        <span className="w-3.5 h-3.5 rounded-sm bg-rose-400 recording-dot" />
      ) : (
        <MicIcon />
      )}
    </motion.button>
  );
}

function SubmitButton({
  onSubmit,
  disabled,
  submitting,
}: {
  onSubmit: () => void;
  disabled: boolean;
  submitting: boolean;
}) {
  return (
    <motion.button
      onClick={onSubmit}
      disabled={disabled}
      whileHover={!disabled ? { scale: 1.02 } : undefined}
      whileTap={!disabled ? { scale: 0.98 } : undefined}
      className={`
        relative overflow-hidden self-end
        inline-flex items-center gap-2
        px-7 py-3 rounded-full font-semibold
        text-sm transition-all
        ${
          submitting
            ? "button-shimmer text-white"
            : disabled
              ? "bg-white/5 text-[#5a5a6e] cursor-not-allowed"
              : "bg-gradient-to-r from-[#6366f1] to-[#818cf8] text-white shadow-[0_0_24px_-4px_rgba(99,102,241,0.6)] hover:shadow-[0_0_32px_-2px_rgba(99,102,241,0.8)]"
        }
      `}
    >
      {submitting ? (
        <>
          <Spinner />
          <span>Scoring your answer…</span>
        </>
      ) : (
        <>
          <span>Submit answer</span>
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
        </>
      )}
    </motion.button>
  );
}

function MicIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11 v1 a7 7 0 0 0 14 0 v-1" />
      <path d="M12 19 v3" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      className="animate-spin"
    >
      <path d="M21 12 a9 9 0 1 1 -9 -9" />
    </svg>
  );
}