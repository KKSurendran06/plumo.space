# Plumo

AI-powered interview simulator. Pick a role, answer 8 adaptive questions by voice or text, get a skill-gap report with a 2-week learning roadmap.

Built for Group 14, Amrita Vishwa Vidyapeetham.

> Stack: Python + Flask backend on Cloud Run, Next.js 14 (App Router) + TypeScript + Tailwind frontend on Vercel, Vertex AI Gemini 2.5 Pro for the interview engine, Cloud Speech-to-Text + Text-to-Speech for voice, Firestore for session state.

> SDG alignment: SDG 4 (Quality Education) — democratizes interview coaching. SDG 8 (Decent Work) — closes employability skill gaps directly.

---

## Quick start (local development)

You need: a Google Cloud project, a service account key as `credentials.json` in the project root, Python 3.11+, Node.js 20+.

```bash
cp .env.example .env
# edit .env and set GCP_PROJECT to your project ID

# Backend
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python main.py            # → http://localhost:8000

# Frontend (in a second terminal)
cd frontend
npm install
npm run dev               # → http://localhost:3000
```

Open http://localhost:3000.

---

## One-time GCP setup

### 1. Create a project and note its ID

```bash
gcloud projects create plumo-dev-XXXX --name="Plumo Dev"
gcloud config set project plumo-dev-XXXX
```

### 2. Enable the required APIs

```bash
gcloud services enable \
  aiplatform.googleapis.com \
  firestore.googleapis.com \
  speech.googleapis.com \
  texttospeech.googleapis.com
```

### 3. Create a Firestore database (Native mode, us-central1)

```bash
gcloud firestore databases create --location=us-central1 --type=firestore-native
```

Or do it via the Console: **Firestore → Create database → Native mode → us-central1**.

### 4. Create a service account and download credentials

```bash
gcloud iam service-accounts create plumo-dev \
  --display-name="Plumo Local Dev"

PROJECT_ID=$(gcloud config get-value project)
SA_EMAIL="plumo-dev@${PROJECT_ID}.iam.gserviceaccount.com"

for ROLE in \
  roles/aiplatform.user \
  roles/datastore.user \
  roles/speech.client \
  roles/cloudtts.user; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="$ROLE"
done

gcloud iam service-accounts keys create credentials.json \
  --iam-account="$SA_EMAIL"
```

The key lands at `./credentials.json` (already in `.gitignore` — never commit).

### 5. Fill in `.env`

```bash
cp .env.example .env
```

Set at least:
- `GCP_PROJECT` — the project ID from step 1
- `GOOGLE_APPLICATION_CREDENTIALS=./credentials.json` (already the default)

---

## Project layout

```
plumo/
├── README.md             ← you are here
├── .env.example          ← copy to .env and fill in
├── backend/
│   ├── main.py           ← Flask routes (5 endpoints)
│   ├── interview_engine.py ← all Vertex AI Gemini logic
│   ├── requirements.txt
│   ├── Dockerfile        ← Cloud Run image
│   └── .dockerignore
└── frontend/
    ├── app/
    │   ├── page.tsx                          ← landing / role selector
    │   ├── layout.tsx                        ← root layout
    │   ├── globals.css                       ← global styles
    │   ├── favicon.ico
    │   ├── _components/
    │   │   └── BackgroundFX.tsx              ← animated background
    │   ├── interview/[sessionId]/page.tsx    ← interview UI
    │   └── report/[sessionId]/page.tsx       ← report + radar chart
    ├── lib/
    │   ├── api.ts        ← typed fetch wrappers
    │   └── types.ts      ← shared types + ALLOWED_ROLES
    ├── next.config.ts    ← output: standalone (for Cloud Run)
    ├── Dockerfile
    └── package.json
```

---

## API reference

| Method | Route                          | Purpose                                                          |
| ------ | ------------------------------ | ---------------------------------------------------------------- |
| GET    | `/health`                      | Liveness check                                                   |
| POST   | `/session/start`               | Create a session, return the first question                      |
| POST   | `/session/<id>/answer`         | Submit an answer, get evaluation + next question (or `done:true`) |
| GET    | `/session/<id>/report`         | Get aggregated skill scores + Gemini-generated roadmap           |
| POST   | `/transcribe`                  | Multipart audio → transcript (Speech-to-Text)                    |
| POST   | `/speak`                       | `{ text }` → MP3 audio (Text-to-Speech)                          |

See the API reference above or check the backend route handlers in `backend/main.py` for the exact schemas.

---

## Deployment

### Backend → Cloud Run

```bash
cd backend
gcloud run deploy plumo-api \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars "GCP_PROJECT=$(gcloud config get-value project),GCP_LOCATION=us-central1"
```

The Dockerfile binds to `$PORT` 8080 via gunicorn, which Cloud Run expects.

### Frontend → Vercel

```bash
cd frontend
vercel --prod
```

Set `NEXT_PUBLIC_API_URL` in the Vercel project settings to your Cloud Run URL.
Set `VERCEL_URL` on the backend (Cloud Run) to your Vercel domain so CORS allows it.

---

## Failure handling at a glance

- **Gemini returns invalid JSON** — one retry, then a safe canned fallback question. Never crashes a session.
- **STT fails / mic permission denied** — text input still works; UI shows "Voice unavailable".
- **TTS fails** — question text is already on screen; audio is silently skipped.
- **Firestore write fails** — logged server-side; response still returned to the user.
- **Session not found** — 404; frontend redirects to homepage with `?error=session_expired`.
- **Session inactive >20 min** — marked expired; 410 on next answer.

The backend handles all failures gracefully — the frontend never shows an error screen, just degrades to text-only mode or shows a retry prompt.
