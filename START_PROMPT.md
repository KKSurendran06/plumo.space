# Plumo — Claude Code Start Prompt

Paste this entire prompt into Claude Code after running `claude` in your project folder.

---

Read CLAUDE.md fully before doing anything. That is your source of truth for the entire build. Do not deviate from it.

You are going to build Plumo end to end, autonomously, without stopping to ask me questions. Make reasonable decisions when something is ambiguous and document them in a file called DECISIONS.md as you go. Do not stop and wait for my input mid-build.

Build in this exact order. Complete and verify each step before moving to the next. Do not skip ahead.

---

**Step 1: Project scaffold**

Create this folder structure:
```
plumo/
├── CLAUDE.md         (already exists)
├── DECISIONS.md      (create this, log decisions here)
├── PROGRESS.md       (create this, update after each step)
├── .env.example      (list all required env vars with descriptions)
├── .gitignore        (node_modules, .env, credentials.json, __pycache__, .next)
├── backend/
│   ├── main.py
│   ├── interview_engine.py
│   ├── requirements.txt
│   └── Dockerfile
└── frontend/
    └── (Next.js app scaffolded here)
```

Scaffold the Next.js frontend with: `npx create-next-app@latest frontend --typescript --tailwind --app --no-git`

---

**Step 2: interview_engine.py**

Build the full Gemini AI engine as specified in CLAUDE.md:
- `get_next_turn(role, history, last_answer)` — returns the next question with evaluation
- `generate_final_report(role, turns)` — aggregates skill scores, detects weak areas, calls Gemini once for the roadmap
- Force `response_mime_type: "application/json"` on all Gemini calls — never parse freeform text
- Implement the retry + safe fallback logic for invalid JSON as specified in CLAUDE.md
- Validate that `role` is in the ALLOWED_ROLES list
- After writing it, run it as a standalone script with a hardcoded "SDE Intern" role and print the output of one full turn to verify it works before moving on

---

**Step 3: main.py (Flask API)**

Build all 5 routes exactly matching the request/response contracts in CLAUDE.md:
- POST `/session/start`
- POST `/session/<session_id>/answer`
- GET `/session/<session_id>/report`
- POST `/transcribe`
- POST `/speak`

Include:
- CORS enabled for localhost:3000 and any VERCEL_URL env var
- Firestore client initialized from env
- Error responses in the format `{ "error": "...", "code": "..." }` with correct HTTP status codes
- Session timeout check on answer submit (mark expired if >20 min inactive)
- Exactly 8 turns then return `{ "done": true }`
- All env vars via `os.getenv()` — nothing hardcoded

---

**Step 4: requirements.txt and Dockerfile**

requirements.txt:
```
flask
flask-cors
google-cloud-firestore
google-cloud-aiplatform
vertexai
google-cloud-speech
google-cloud-texttospeech
gunicorn
python-dotenv
```

`backend/Dockerfile` for Cloud Run:
```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
CMD ["gunicorn", "--bind", "0.0.0.0:8080", "main:app"]
```

`frontend/Dockerfile` for Cloud Run:
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
```

Also update `frontend/next.config.ts` to enable standalone output for the Docker build:
```ts
const nextConfig = {
  output: "standalone",
};
export default nextConfig;
```

---

**Step 5: Frontend — landing page (`app/page.tsx`)**

Dark theme. Build a clean, impressive landing page with:
- Plumo as the product name, prominent
- One-line description: "AI-powered interview simulator. Real questions. Real feedback."
- Role selector (dropdown) using the ALLOWED_ROLES list
- "Start Interview" button — calls POST `/session/start`, redirects to `/interview/[sessionId]`
- Loading state on the button while the API call is in flight
- Store the first question from the start response in sessionStorage keyed by sessionId before redirecting
- Error handling: if API fails, show inline error message, don't crash

Design direction: dark background (#0a0a0a), sharp white typography, minimal. Think terminal meets product. Not purple gradients, not generic SaaS.

Specific UI elements:
- Large hero text "Plumo" at top center, monospace or sharp serif font
- Subtitle: "AI-powered interview simulator. Real questions. Real feedback." in muted gray (#666)
- Role dropdown styled to match dark theme (dark border, white text, no default browser styling)
- "Start Interview" CTA — white background, black text, full width or prominent center
- 3 short feature callouts below the fold: "Adaptive difficulty", "Real-time scoring", "Skill gap report" as icon+text rows
- Footer: "Built with Vertex AI" small and muted

---

**Step 6: Frontend — interview page (`app/interview/[sessionId]/page.tsx`)**

This is the core UI. Build it fully:

Layout:
- Top bar: "Plumo" left, "Question X/8" center, difficulty badge right (green=easy, yellow=medium, red=hard)
- Previous answer evaluation card (score + feedback + matched/missing keywords) — hidden on first question
- Current question card — large, prominent, with skills_tested shown as small tags below
- Mic button (large, center) + text area below it
- Submit button — disabled while loading or answer is empty

Behavior:
- On load: read first question from sessionStorage
- Mic button: uses MediaRecorder API (no libraries) to record audio, sends blob to POST `/transcribe`, drops transcript into text area. User can edit before submitting.
- TTS: when a new question loads, call POST `/speak` with the question text, play the returned MP3 with `new Audio().play()`. If it fails, silently skip — show text only.
- On submit: call POST `/session/:id/answer`, show loading skeleton, update UI with evaluation + next question
- If `done: true` in response: redirect to `/report/[sessionId]`
- If mic permission denied or STT fails: show small inline message "Voice unavailable — type your answer", text area stays fully functional
- Skeleton loaders while waiting for AI response — never blank screen

---

**Step 7: Frontend — report page (`app/report/[sessionId]/page.tsx`)**

Build the full report page:
- On load: call GET `/session/:id/report`, show loading state
- Radar chart using Recharts `RadarChart` — full width, axes are skills, values are avg scores 0-10
- Weak areas banner: red/amber callout listing skills below 6 — hidden if none
- Score breakdown: simple grid showing each skill and its avg score
- Learning roadmap: week-by-week cards, each with focus area and resource links
- "Start New Interview" button at bottom linking back to homepage
- Same dark theme as landing page

---

**Step 8: Environment and wiring**

Create `.env.example`:
```
GCP_PROJECT=your-gcp-project-id
GOOGLE_APPLICATION_CREDENTIALS=./credentials.json
FLASK_ENV=development
NEXT_PUBLIC_API_URL=http://localhost:8000
```

Update frontend to read `NEXT_PUBLIC_API_URL` from env for all fetch calls — never hardcode localhost.

Create a root `README.md` with exact setup steps:
1. GCP project setup and API enablement commands
2. Service account creation and credentials.json download
3. Firestore setup (Native mode, us-central1)
4. `cp .env.example .env` and fill in values
5. Backend: `pip install -r requirements.txt` + `python main.py`
6. Frontend: `npm install` + `npm run dev`

---

**Step 9: Final check**

After all steps are done:
- Update PROGRESS.md marking everything complete
- Update DECISIONS.md with any architectural decisions you made
- List in PROGRESS.md anything that still needs manual setup (e.g. GCP project creation, credentials file)
- Do a final read of CLAUDE.md and check your build against the acceptance checklist — note any items not yet met

Do not ask me anything during this build. Make decisions, document them, keep moving.
