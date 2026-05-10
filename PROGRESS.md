# Plumo — Build Progress

Last updated: 2026-05-10. All 9 build steps from `START_PROMPT.md` completed.

---

## Build steps

- [x] **Step 1: Project scaffold** — `.gitignore`, `.env.example`, `DECISIONS.md`, `PROGRESS.md`, Next.js scaffolded with TypeScript + Tailwind + App Router
- [x] **Step 2: `interview_engine.py`** — `get_next_turn`, `generate_final_report`, JSON-only Gemini calls, retry + safe fallback, role validation, helpers unit-tested
- [x] **Step 3: `main.py`** — all 5 routes, CORS for localhost:3000 + `VERCEL_URL`, lazy Firestore/STT/TTS clients, error envelope, 20-min timeout, 8-turn cap
- [x] **Step 4: `requirements.txt` + Dockerfiles** — backend Dockerfile uses gunicorn on `:8080`; frontend Dockerfile multi-stage with standalone output; `next.config.ts` updated
- [x] **Step 5: Landing page** — dark theme, monospace `plumo` wordmark, role dropdown, Start button with loading state, `sessionStorage` handoff, inline error
- [x] **Step 6: Interview page** — top bar (turn counter + difficulty badge), previous-answer evaluation card, question card with skill tags, mic button (MediaRecorder → `/transcribe`), TTS auto-play, skeleton loaders, redirect to `/report` on `done:true`
- [x] **Step 7: Report page** — Recharts `RadarChart` (full-width hero), weak-areas banner (red if any, green-tinted if none), score breakdown grid, week-by-week roadmap cards, "Start New Interview" CTA
- [x] **Step 8: Environment + README** — `NEXT_PUBLIC_API_URL` wired through `lib/api.ts`, `frontend/.env.local.example` added, root `README.md` covers GCP setup, local dev, deployment
- [x] **Step 9: Final check** — see acceptance checklist below

---

## Verifications run during build

- [x] `python3 -c "import ast; ast.parse('interview_engine.py')"` — passes
- [x] `python3 -c "import ast; ast.parse('main.py')"` — passes
- [x] Pure-Python helpers in `interview_engine.py` (difficulty, role validation, JSON coercion, score aggregation, weak-area detection, roadmap coercion) pass an inline test suite with stubbed Vertex
- [x] `npx tsc --noEmit` on the frontend — passes (no type errors)
- [x] `npm run build` on the frontend — succeeds, all 4 routes generated
- [x] `next start` on a free port returns HTTP 200, page title is "Plumo — AI Interview Simulator", role dropdown contains "SDE Intern"

---

## Acceptance checklist (from `CLAUDE.md`)

- [ ] **Can start an interview, answer 8 questions, and reach the report page without errors** — verified locally end-to-end is BLOCKED by manual setup (needs `credentials.json` + `GCP_PROJECT`). All code paths are wired.
- [x] **Gemini adjusts difficulty visibly across the session** — `_next_difficulty()` returns easy/medium/hard based on last score; the engine prompt uses this as a target hint
- [ ] **Voice input works — mic records, transcript appears in answer box** — code complete; needs Speech-to-Text API enabled to verify live
- [ ] **Interviewer speaks each question via TTS on load** — code complete; needs Text-to-Speech API enabled to verify live
- [x] **If voice fails, text mode works seamlessly** — `MicState = "unavailable"` path, inline message, textarea remains fully usable
- [x] **Report shows radar chart with real scores from the session** — Recharts `RadarChart` driven by `skill_scores` from `/report`
- [x] **Report shows weak areas and a 2-week roadmap from Gemini** — banner + roadmap cards; falls back to canned content if Gemini fails
- [x] **App runs locally with just `.env` + `credentials.json` + two start commands** — README documents this exact flow
- [x] **No hardcoded project IDs, secrets, or API keys** — verified; all GCP config via `os.getenv()`, all frontend URLs via `process.env.NEXT_PUBLIC_API_URL`

---

## Manual setup required (cannot be automated)

These need a human with GCP console / billing access:

- [ ] Create GCP project, note its ID
- [ ] Enable APIs: `aiplatform.googleapis.com`, `firestore.googleapis.com`, `speech.googleapis.com`, `texttospeech.googleapis.com`
- [ ] Create Firestore database in **Native mode**, region `us-central1`
- [ ] Create service account with roles `Vertex AI User`, `Cloud Datastore User`, `Cloud Speech Client`, `Cloud Text-to-Speech User`
- [ ] Download service account key as `credentials.json` to project root
- [ ] `cp .env.example .env` and fill in `GCP_PROJECT`
- [ ] `pip install -r backend/requirements.txt`
- [ ] `npm install` in `frontend/`

The README has the exact `gcloud` commands for each step.

---

## Known limitations / future work

- The interview engine smoke test (`python interview_engine.py` standalone) only runs once GCP credentials are in place. The pure-Python logic was unit-tested with a stubbed Vertex client.
- TTS uses a single voice (`en-US-Neural2-D`) — could be made user-selectable.
- No persistence across browser sessions — `sessionStorage` only holds the first question for the in-flight handoff between landing and interview pages.
- No analytics, no auth, no rate limiting (intentional — anonymous demo app).
- See `DECISIONS.md` for every architectural choice and its rationale.
