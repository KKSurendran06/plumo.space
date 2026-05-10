"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
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
    // stop any in-flight playback
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

  // Cleanup mic stream on unmount
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
    <main className="flex flex-col min-h-screen">
      <TopBar
        turn={turnNumber}
        total={TOTAL_TURNS}
        difficulty={question?.difficulty}
      />

      <div className="flex-1 max-w-3xl w-full mx-auto px-6 py-10 flex flex-col gap-8">
        {previousEval && <EvaluationCard evaluation={previousEval} />}

        {question ? (
          <QuestionCard
            question={question}
            ttsState={ttsState}
            onReplay={() => void playTts(question.question)}
          />
        ) : (
          <QuestionSkeleton />
        )}

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
          <div className="px-4 py-3 border border-red-900/50 bg-red-950/40 text-red-300 text-sm">
            {error}
          </div>
        )}
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------

function TopBar({
  turn,
  total,
  difficulty,
}: {
  turn: number;
  total: number;
  difficulty?: Difficulty;
}) {
  return (
    <div className="border-b border-[#1a1a1a] px-6 py-4 flex items-center">
      <div className="flex-1 font-mono text-sm text-white">plumo</div>
      <div className="flex-1 text-center text-xs uppercase tracking-widest text-[#666]">
        Question {turn} / {total}
      </div>
      <div className="flex-1 flex justify-end">
        {difficulty && <DifficultyBadge difficulty={difficulty} />}
      </div>
    </div>
  );
}

function DifficultyBadge({ difficulty }: { difficulty: Difficulty }) {
  const styles: Record<Difficulty, string> = {
    easy: "border-green-700/50 text-green-400 bg-green-950/30",
    medium: "border-yellow-700/50 text-yellow-300 bg-yellow-950/30",
    hard: "border-red-700/50 text-red-400 bg-red-950/30",
  };
  return (
    <span
      className={`px-3 py-1 text-xs uppercase tracking-widest border ${styles[difficulty]}`}
    >
      {difficulty}
    </span>
  );
}

function QuestionCard({
  question,
  ttsState,
  onReplay,
}: {
  question: QuestionPayload;
  ttsState: TtsState;
  onReplay: () => void;
}) {
  return (
    <div className="border border-[#222] bg-[#0d0d0d] p-8">
      <div className="flex items-start gap-4">
        <p className="flex-1 text-xl md:text-2xl text-white leading-relaxed">
          {question.question}
        </p>
        <SpeakerButton ttsState={ttsState} onClick={onReplay} />
      </div>
      <div className="mt-6 flex flex-wrap gap-2">
        {question.skills_tested.map((s) => (
          <span
            key={s}
            className="text-xs px-2 py-1 border border-[#222] text-[#888] uppercase tracking-wider"
          >
            {s}
          </span>
        ))}
      </div>
      {ttsState === "failed" && (
        <p className="mt-4 text-xs text-[#888]">
          Audio unavailable — read the question above.
        </p>
      )}
    </div>
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
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      title={label}
      aria-label={label}
      className={`
        shrink-0 w-10 h-10 flex items-center justify-center
        border transition-colors
        ${
          playing
            ? "border-green-700/60 bg-green-950/30 text-green-300"
            : "border-[#222] bg-[#0d0d0d] text-[#bbb] hover:bg-[#161616] hover:text-white"
        }
        disabled:opacity-50 disabled:cursor-not-allowed
      `}
    >
      <SpeakerIcon playing={playing} />
    </button>
  );
}

function SpeakerIcon({ playing }: { playing: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
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

function QuestionSkeleton() {
  return (
    <div className="border border-[#222] bg-[#0d0d0d] p-8">
      <div className="skeleton h-6 w-full mb-3" />
      <div className="skeleton h-6 w-5/6 mb-3" />
      <div className="skeleton h-6 w-2/3" />
    </div>
  );
}

function EvaluationCard({ evaluation }: { evaluation: Evaluation }) {
  const scoreColor =
    evaluation.score >= 8
      ? "text-green-400"
      : evaluation.score >= 5
        ? "text-yellow-300"
        : "text-red-400";
  return (
    <div className="border border-[#1a1a1a] bg-[#0c0c0c] p-6">
      <div className="flex items-baseline justify-between mb-3">
        <span className="text-xs uppercase tracking-widest text-[#666]">
          Previous answer
        </span>
        <span className={`font-mono text-2xl ${scoreColor}`}>
          {evaluation.score}
          <span className="text-[#444] text-base">/10</span>
        </span>
      </div>
      <p className="text-sm text-[#ccc] leading-relaxed mb-4">
        {evaluation.feedback}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <KeywordBlock title="Matched" color="green" words={evaluation.keywords_matched} />
        <KeywordBlock title="Missing" color="red" words={evaluation.keywords_missing} />
      </div>
    </div>
  );
}

function KeywordBlock({
  title,
  color,
  words,
}: {
  title: string;
  color: "green" | "red";
  words: string[];
}) {
  const palette =
    color === "green"
      ? "border-green-900/40 text-green-400"
      : "border-red-900/40 text-red-400";
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-[#666] mb-2">
        {title}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {words.length === 0 ? (
          <span className="text-[#444] text-xs">—</span>
        ) : (
          words.map((w) => (
            <span
              key={w}
              className={`text-xs px-2 py-0.5 border ${palette}`}
            >
              {w}
            </span>
          ))
        )}
      </div>
    </div>
  );
}

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
  const disabled = micState === "unavailable" || transcribing || requesting;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <button
          onClick={onMicClick}
          disabled={disabled || submitting}
          className={`
            flex items-center gap-2 px-4 py-3 border
            ${
              recording
                ? "border-red-700 bg-red-950/40 text-red-300"
                : "border-[#222] bg-[#0d0d0d] text-white hover:bg-[#161616]"
            }
            disabled:opacity-40 disabled:cursor-not-allowed transition-colors
          `}
          aria-label={recording ? "Stop recording" : "Start recording"}
        >
          {recording && (
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 recording-dot" />
          )}
          <span className="text-sm">
            {requesting && "Requesting mic…"}
            {recording && "Stop recording"}
            {transcribing && "Transcribing…"}
            {micState === "idle" && "Record answer"}
            {micState === "unavailable" && "Voice unavailable"}
          </span>
        </button>
        {voiceMessage && (
          <span className="text-xs text-[#888]">{voiceMessage}</span>
        )}
      </div>

      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Type your answer or use the mic above…"
        rows={6}
        className="
          w-full bg-[#0d0d0d] border border-[#222]
          text-white p-4 resize-y
          focus:outline-none focus:border-[#444]
          placeholder:text-[#444]
          font-sans text-base leading-relaxed
        "
        disabled={submitting}
      />

      <button
        onClick={onSubmit}
        disabled={!value.trim() || submitting}
        className="
          self-end bg-white text-black font-medium
          px-6 py-3 hover:bg-[#e0e0e0] transition-colors
          disabled:opacity-40 disabled:cursor-not-allowed
        "
      >
        {submitting ? "Scoring…" : "Submit answer"}
      </button>
    </div>
  );
}
