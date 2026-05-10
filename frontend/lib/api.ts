import type {
  AnswerResponse,
  ApiError,
  ReportResponse,
  StartSessionResponse,
} from "./types";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ||
  "http://localhost:8000";

async function parseJsonOrThrow<T>(res: Response): Promise<T> {
  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new ApiClientError(
      `Invalid JSON from API (${res.status})`,
      "INVALID_RESPONSE",
      res.status,
    );
  }
  if (!res.ok) {
    const e = data as Partial<ApiError> | null;
    throw new ApiClientError(
      e?.error || `Request failed (${res.status})`,
      e?.code || "HTTP_ERROR",
      res.status,
    );
  }
  return data as T;
}

export class ApiClientError extends Error {
  code: string;
  status: number;
  constructor(message: string, code: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export async function startSession(role: string): Promise<StartSessionResponse> {
  const res = await fetch(`${API_URL}/session/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role }),
  });
  return parseJsonOrThrow<StartSessionResponse>(res);
}

export async function submitAnswer(
  sessionId: string,
  answer: string,
): Promise<AnswerResponse> {
  const res = await fetch(`${API_URL}/session/${sessionId}/answer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ answer }),
  });
  return parseJsonOrThrow<AnswerResponse>(res);
}

export async function getReport(sessionId: string): Promise<ReportResponse> {
  const res = await fetch(`${API_URL}/session/${sessionId}/report`);
  return parseJsonOrThrow<ReportResponse>(res);
}

export async function transcribeAudio(blob: Blob): Promise<string> {
  const form = new FormData();
  form.append("audio", blob, "audio.webm");
  const res = await fetch(`${API_URL}/transcribe`, {
    method: "POST",
    body: form,
  });
  const data = await parseJsonOrThrow<{ transcript: string }>(res);
  return data.transcript;
}

export async function fetchSpeech(text: string): Promise<Blob> {
  const res = await fetch(`${API_URL}/speak`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    throw new ApiClientError("TTS failed", "TTS_FAILED", res.status);
  }
  return res.blob();
}
