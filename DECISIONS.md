# Plumo — Architectural Decisions Log

Decisions made during the autonomous build, with rationale. Append-only.

---

## 2026-05-10 — Initial build

### D1: Backend dev port = 8000
START_PROMPT specifies `NEXT_PUBLIC_API_URL=http://localhost:8000` but doesn't specify the Flask runtime port. Using 8000 in dev to match the env example. Cloud Run expects 8080 in the container (Dockerfile sets that explicitly via gunicorn).

### D2: Session timeout = 20 minutes
CLAUDE.md says 30 min, START_PROMPT says 20 min. START_PROMPT is the more recent authoritative source for build steps, so going with 20 minutes. Stored as `lastActivityAt` timestamp on each session, checked on `/answer` submit.

### D3: Single Gemini model variable
All Gemini calls go through one configurable model name (`GEMINI_MODEL`, defaulting to `gemini-1.5-pro-002`). Lets us swap to Flash in an emergency without code changes, but defaults match CLAUDE.md's Pro requirement.

### D4: Firestore session ID = uuid4 hex
No auth, anonymous sessions. Generating IDs server-side as 32-char hex strings (uuid4().hex) — URL-safe, no dashes to break routing.

### D5: Error response shape
Following CLAUDE.md exactly: `{ "error": "...", "code": "..." }`. Defined error codes:
- `INVALID_ROLE`, `MISSING_FIELD` — 400
- `SESSION_NOT_FOUND`, `SESSION_EXPIRED` — 404 / 410
- `SESSION_COMPLETE` — 409 (answer submitted to a finished session)
- `GEMINI_INVALID_JSON`, `GEMINI_FAILED` — 500 (with safe fallback applied first)
- `STT_FAILED`, `TTS_FAILED` — 500
- `FIRESTORE_WRITE_FAILED` — 500 (logged but response still sent when possible)

### D6: TTS audio format
MP3 (LINEAR16 not browser-friendly without conversion). `audioEncoding: "MP3"`, sample rate left as default for the chosen voice.

### D7: STT audio format
Browser MediaRecorder default produces `audio/webm;codecs=opus`. Configured STT with `WEBM_OPUS` encoding at 48000 Hz to match.

### D8: Frontend API client
Single `lib/api.ts` module wraps fetch with `NEXT_PUBLIC_API_URL`. No external HTTP library — keeps the bundle lean.

### D9: Recharts for radar chart
Specified by CLAUDE.md. Added as a frontend dependency.

### D10: Mic button UX when permission denied
The first time the mic is clicked, we request permission. If denied, we cache that state in component memory and show the "Voice unavailable" message. Subsequent clicks do nothing (no re-prompt loop).

### D11: TTS auto-play handling
Browsers block autoplay without user gesture. The first question's TTS is triggered after the user clicks "Start Interview" (which counts as a gesture), so it should play on the interview page load. If the audio play() promise rejects, we silently swallow and fall back to text-only.

### D12: ALLOWED_ROLES duplicated
Lives both in backend (`interview_engine.py`) and frontend (landing page). Source of truth is the backend; if they diverge, backend rejects unknown roles with 400. Acceptable for a one-shot project list of 7 strings.

### D13: Sessions are read fully on each turn
Firestore document size is well under the 1MB limit for 8 turns of text. We read the full session doc, append a turn, and write it back. No subcollections, no streaming — keeps the code straightforward.

### D14: First-question evaluation = null
Per CLAUDE.md schema, the first turn has no answer yet, so `evaluation: null` in the question response. The interview engine takes `last_answer=None` as the signal to skip evaluation.

---

## 2026-05-10 — Post-build fixes

### D15: Forced model migration to `gemini-2.5-pro`
CLAUDE.md said "Gemini 1.5 Pro — don't revisit", but `gemini-1.5-pro-002` returns 404 on Vertex as of today (Google removed it; the legacy `vertexai` SDK referencing 1.5 reaches end-of-life on June 24, 2026). Smoke test confirmed: `404 Publisher Model ... was not found`. Swapped the default in `interview_engine.py` to `gemini-2.5-pro` — current top-tier Vertex model, supports `response_mime_type: application/json`, drop-in compatible with `GenerativeModel(...)`. `GEMINI_MODEL` env var still overrides.
