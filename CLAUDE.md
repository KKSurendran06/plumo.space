# Plumo — Project Brief for Claude Code

## What we're building

Plumo is an AI-powered interview simulator that emulates a live hiring manager. Not a Q&A bot — a full adaptive system that adjusts question difficulty in real-time based on how the user is performing, gives multi-dimensional feedback after each answer, and generates a personalized skill gap report at the end.

Built for a college project (Group 14, Amrita Vishwa Vidyapeetham). Needs to be impressive for demo day.

---

## Core user flow

1. User lands on homepage, picks a job role (SDE Intern, Backend Engineer, ML Engineer, etc.)
2. Interview starts — AI interviewer speaks the question aloud (Text-to-Speech)
3. User responds via mic (Speech-to-Text) OR types — their choice
4. After each answer: score (x/10), keyword feedback, and next question (harder or easier based on score)
5. After 8 questions: full report with radar chart of skill scores + weak area detection + 2-week learning roadmap

---

## Tech stack

### Backend
- **Python + Flask** — REST API
- **Deployed to Cloud Run** (containerized with Docker)
- **Firestore** — NoSQL, stores session state and all turn data

### Frontend
- **Next.js 14 (App Router) + TypeScript + Tailwind CSS**
- **Recharts** — radar chart for skill visualization on report page
- **Web Audio API** — mic recording in browser, no external library needed

### AI (Google Cloud — $300 Vertex AI credits available, use them)
- **Vertex AI Gemini 2.5 Pro** — core interview engine (question generation + answer evaluation)
- **Cloud Speech-to-Text** — converts user's spoken answer to text
- **Cloud Text-to-Speech** — interviewer speaks questions aloud (use `en-US-Neural2-D` voice, sounds professional)
- **Cloud Functions** — event-driven triggers if needed (optional, use Cloud Run first)

### Infrastructure
- **GCP Project** with all APIs enabled
- **Service account** with editor role for local dev
- `GOOGLE_APPLICATION_CREDENTIALS` pointing to credentials.json locally
- Cloud Run for backend, Vercel for frontend

---

## Project structure

```
plumo/
├── CLAUDE.md                  ← you are here
├── .env                       ← GCP_PROJECT, etc.
├── backend/
│   ├── main.py                ← Flask app, all API routes
│   ├── interview_engine.py    ← Gemini AI logic (keep this separate)
│   ├── requirements.txt
│   └── Dockerfile
└── frontend/
    ├── app/
    │   ├── page.tsx           ← landing / role selector
    │   ├── interview/
    │   │   └── [sessionId]/
    │   │       └── page.tsx   ← interview UI
    │   └── report/
    │       └── [sessionId]/
    │           └── page.tsx   ← report + radar chart
    └── package.json
```

---

## API routes (Flask backend)

| Method | Route | What it does |
|--------|-------|--------------|
| POST | `/session/start` | Creates session in Firestore, returns first question |
| POST | `/session/:id/answer` | Takes answer, returns evaluation + next question |
| GET | `/session/:id/report` | Generates final report with skill scores + roadmap |
| POST | `/transcribe` | Takes audio blob, returns transcript via Speech-to-Text |
| POST | `/speak` | Takes text, returns MP3 audio via Text-to-Speech |

---

## Firestore data model

```
sessions/{sessionId}
  role: string
  status: "active" | "complete"
  createdAt: timestamp
  turns: [
    {
      answer: string | null,
      response: {
        question: string,
        difficulty: "easy" | "medium" | "hard",
        skills_tested: string[],
        evaluation: {
          score: number (1-10),
          feedback: string,
          keywords_matched: string[],
          keywords_missing: string[]
        } | null   ← null on first turn (no answer yet)
      }
    }
  ]
  report: {
    skill_scores: { DSA: 7.2, SQL: 4.1, ... },
    weak_areas: ["SQL", "Communication"],
    roadmap: [{ week: 1, focus: "...", resources: ["..."] }]
  }
```

---

## Gemini prompt design (interview engine)

The system prompt must:
- Set the AI as a strict but fair interviewer for the chosen role
- Force JSON-only responses (use `response_mime_type: application/json`)
- Tag every question with which skills it tests: `["DSA", "System Design", "SQL", "OOP", "Behavioral", "Communication"]`
- Adjust difficulty based on last score: score < 5 → easier, score > 7 → harder
- Always return this exact shape:

```json
{
  "question": "...",
  "difficulty": "easy|medium|hard",
  "skills_tested": ["..."],
  "evaluation": {
    "score": 0,
    "feedback": "...",
    "keywords_matched": ["..."],
    "keywords_missing": ["..."]
  }
}
```

Evaluation is `null` on the first turn (nothing to evaluate yet).

Final report roadmap is a separate Gemini call — pass in the aggregated skill scores and weak areas, ask for a 2-week plan in JSON.

---

## Voice feature (important — use Vertex AI credits)

### User speaks (STT):
- Browser records via `MediaRecorder` API (no library)
- Sends audio blob to `/transcribe`
- Flask uses `google.cloud.speech` — `WEBM_OPUS` encoding, 48000hz
- Returns transcript, drops into answer box (user can edit before submitting)

### Interviewer speaks (TTS):
- When a new question loads, frontend calls `/speak` with the question text
- Flask uses `google.cloud.texttospeech` — voice `en-US-Neural2-D`
- Returns MP3, frontend plays it with `new Audio(...).play()`
- Auto-plays on question load

No avatar/face. Voice + text is the right call — avatar adds latency and complexity with no real benefit for this use case.

---

## Skill gap detection logic

After all 8 turns, aggregate scores per skill:

```python
skill_scores = {}
for turn in turns:
    if turn["response"]["evaluation"]:
        for skill in turn["response"]["skills_tested"]:
            skill_scores[skill].append(turn["response"]["evaluation"]["score"])

avg_scores = { skill: mean(scores) for skill, scores in skill_scores.items() }
weak_areas = [skill for skill, avg in avg_scores.items() if avg < 6]
```

Feed `avg_scores` + `weak_areas` to Gemini for roadmap generation.

---

## Report page

- **Radar chart** using Recharts `RadarChart` — axes are the skills tested, values are avg scores
- **Weak area callout** — red banner listing skills below 6/10
- **Learning roadmap** — week-by-week cards generated by Gemini
- Keep it clean, no fluff

---

## SDG alignment (for project submission framing)

- **SDG 4 – Quality Education:** democratizes access to quality interview coaching, no cost barrier
- **SDG 8 – Decent Work & Economic Growth:** targets skill gaps directly, improves employability

Mention these in the README, not in the UI.

---

## Rules for Claude Code when building this

- Always keep `interview_engine.py` separate from `main.py` — AI logic stays isolated
- Use `response_mime_type: "application/json"` on all Gemini calls — never parse freeform text
- Never hardcode GCP project ID — always read from `os.getenv("GCP_PROJECT")`
- Firestore writes happen after every turn — don't batch, session state must be durable
- Stop the interview at exactly 8 turns, then redirect to `/report/[sessionId]`
- Frontend: no external audio libraries — use Web Audio API and `MediaRecorder` natively
- Tailwind only for styling — no additional CSS frameworks
- When in doubt about a Vertex AI call, check the `google-cloud-aiplatform` Python SDK docs

---

## What's already decided (don't revisit these)

- No avatar/face for the interviewer
- 8 questions per session (hardcoded, not configurable)
- Gemini 2.5 Pro for all AI calls (not Flash — quality matters here). Originally specced as 1.5 Pro, but `gemini-1.5-pro-002` was removed from Vertex in 2026; see DECISIONS.md D15.
- Cloud Run for backend (not Cloud Functions as primary runtime)
- Next.js App Router (not Pages Router)

---

## Exact request/response contracts

### POST `/session/start`
```json
// Request
{ "role": "SDE Intern" }

// Response
{
  "session_id": "uuid",
  "question": {
    "question": "...",
    "difficulty": "easy",
    "skills_tested": ["DSA"],
    "evaluation": null
  }
}
```

### POST `/session/:id/answer`
```json
// Request
{ "answer": "user's answer text" }

// Response (mid-session)
{
  "done": false,
  "turn_number": 2,
  "evaluation": {
    "score": 7,
    "feedback": "...",
    "keywords_matched": ["..."],
    "keywords_missing": ["..."]
  },
  "next_question": {
    "question": "...",
    "difficulty": "hard",
    "skills_tested": ["System Design"],
    "evaluation": null
  }
}

// Response (after turn 8)
{ "done": true, "session_id": "uuid" }
```

### GET `/session/:id/report`
```json
{
  "skill_scores": { "DSA": 7.2, "SQL": 4.1, "Communication": 6.5 },
  "weak_areas": ["SQL"],
  "roadmap": [
    { "week": 1, "focus": "SQL fundamentals", "resources": ["LeetCode SQL 50", "Mode Analytics tutorial"] },
    { "week": 2, "focus": "Advanced joins and indexing", "resources": ["Use The Index, Luke", "pgexercises.com"] }
  ]
}
```

### POST `/transcribe`
```json
// Request: multipart/form-data with audio blob
// Response
{ "transcript": "user's spoken answer as text" }
```

### POST `/speak`
```json
// Request
{ "text": "question text to synthesize" }
// Response: audio/mp3 binary
```

### Error response format (all endpoints)
```json
{ "error": "short description", "code": "GEMINI_INVALID_JSON | STT_FAILED | SESSION_NOT_FOUND | etc" }
```
Always return appropriate HTTP status codes: 400 for bad input, 404 for missing session, 500 for upstream failures.

---

## Failure handling (critical for demo reliability)

### Gemini returns invalid JSON
- Retry the call once with the same prompt
- If retry also fails, return a safe hardcoded fallback question: `{ "question": "Can you walk me through how you'd approach debugging a production issue?", "difficulty": "medium", "skills_tested": ["Behavioral"], "evaluation": null }`
- Never crash the session over a bad Gemini response

### STT fails (mic permission denied or API error)
- Silently fall back to text input mode — mic button becomes inactive
- Show a small inline message: "Voice unavailable — type your answer below"
- Session continues normally, no error page

### TTS fails (API error or audio playback blocked)
- Fall back to text-only — question displays as text, no audio
- Never block the interview flow waiting for audio to play
- Auto-proceed to show question text immediately if audio errors

### Firestore write fails
- Log the error server-side
- Still return the response to the frontend so the user isn't blocked
- On next successful write, include the missed turn data

### Session not found
- Return 404, frontend redirects to homepage with a `?error=session_expired` param
- Show a brief toast: "Session expired. Start a new interview."

---

## Non-functional requirements

- App must run locally with only: `.env`, `credentials.json`, `pip install -r requirements.txt`, `npm install`, two start commands
- All Gemini calls must use `response_mime_type: "application/json"` — no freeform parsing ever
- Every Firestore write is per-turn, not batched — session state must be durable mid-interview
- Backend must have CORS enabled for `localhost:3000` in dev and the Vercel URL in prod
- All env vars via `os.getenv()` — nothing hardcoded
- Frontend loading states: question area shows skeleton while waiting for AI response, submit button disabled during in-flight requests
- No auth required — sessions are anonymous, identified by UUID only
- Session timeout: if a session is inactive for 30 minutes, mark it `expired` in Firestore (can be a simple timestamp check on answer submit)

---

## Allowed job roles (hardcoded list, no free text input)

```python
ALLOWED_ROLES = [
  "SDE Intern",
  "Backend Engineer",
  "Frontend Engineer",
  "Full Stack Engineer",
  "ML Engineer",
  "Data Analyst",
  "DevOps Engineer"
]
```

Validate on `/session/start` — reject any role not in this list with 400.

---

## UI requirements (so it doesn't look like a skeleton on demo day)

- Dark theme preferred — feels more "interview room" than a white dashboard
- Interview page: question in a prominent card, difficulty badge (color-coded: green/yellow/red), skills tested as small tags, score from previous answer shown above current question
- Mic button: prominent, shows recording state (pulsing red dot when active)
- Report page: radar chart is the hero element, full width, above the fold
- Loading states everywhere — never show a blank screen while waiting for AI
- No placeholder text like "Question will appear here" — use skeletons instead

---

## Acceptance checklist (definition of done)

- [ ] Can start an interview, answer 8 questions, and reach the report page without errors
- [ ] Gemini adjusts difficulty visibly across the session (not all same difficulty)
- [ ] Voice input works — mic records, transcript appears in answer box
- [ ] Interviewer speaks each question via TTS on load
- [ ] If voice fails, text mode works seamlessly
- [ ] Report shows radar chart with real scores from the session
- [ ] Report shows weak areas and a 2-week roadmap from Gemini
- [ ] App runs locally with just `.env` + `credentials.json` + two start commands
- [ ] No hardcoded project IDs, secrets, or API keys in code

---

## Current status

Starting from scratch. Nothing is built yet. Begin with:

1. Backend `interview_engine.py` — get the Gemini loop working first
2. Flask routes in `main.py`
3. Firestore schema setup
4. Frontend pages in order: landing → interview → report
5. Voice (STT + TTS) added last, once core flow works

Test each piece in isolation before wiring up. Run the engine as a standalone Python script first to verify the Gemini prompt before touching Flask.
