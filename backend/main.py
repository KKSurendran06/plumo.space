"""
Plumo — Flask backend.

Routes:
  POST /session/start
  POST /session/<id>/answer
  GET  /session/<id>/report
  POST /transcribe
  POST /speak
"""

from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from dotenv import load_dotenv
from flask import Flask, Response, jsonify, request
from flask_cors import CORS
from google.cloud import firestore, speech, texttospeech

from interview_engine import (
    ALLOWED_ROLES,
    TOTAL_TURNS,
    generate_final_report,
    get_next_turn,
)

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("plumo")

SESSION_TIMEOUT_MINUTES = 20
TTS_VOICE_NAME = "en-US-Neural2-D"


# ---- App + clients -----------------------------------------------------------

def _create_app() -> Flask:
    app = Flask(__name__)

    allowed_origins = ["http://localhost:3000", "http://localhost:3002"]
    vercel = os.getenv("VERCEL_URL")
    if vercel:
        if not vercel.startswith("http"):
            vercel = f"https://{vercel}"
        allowed_origins.append(vercel.rstrip("/"))

    CORS(app, resources={r"/*": {"origins": allowed_origins}})
    return app


app = _create_app()

# Lazy-init clients so missing creds don't crash at import time
_clients: dict[str, Any] = {}


def db() -> firestore.Client:
    if "firestore" not in _clients:
        _clients["firestore"] = firestore.Client(project=os.getenv("GCP_PROJECT"))
    return _clients["firestore"]


def stt() -> speech.SpeechClient:
    if "stt" not in _clients:
        _clients["stt"] = speech.SpeechClient()
    return _clients["stt"]


def tts() -> texttospeech.TextToSpeechClient:
    if "tts" not in _clients:
        _clients["tts"] = texttospeech.TextToSpeechClient()
    return _clients["tts"]


# ---- Helpers -----------------------------------------------------------------

def err(message: str, code: str, status: int) -> tuple[Response, int]:
    return jsonify({"error": message, "code": code}), status


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def session_ref(session_id: str) -> firestore.DocumentReference:
    return db().collection("sessions").document(session_id)


def safe_firestore_set(ref: firestore.DocumentReference, data: dict[str, Any]) -> bool:
    """Best-effort write. Logs and returns False on failure but never raises."""
    try:
        ref.set(data, merge=True)
        return True
    except Exception as e:
        logger.error("Firestore write failed for %s: %s", ref.path, e)
        return False


def is_expired(session: dict[str, Any]) -> bool:
    last = session.get("lastActivityAt")
    if not last:
        return False
    if hasattr(last, "to_datetime"):  # Firestore Timestamp
        last = last.to_datetime()
    if isinstance(last, datetime) and last.tzinfo is None:
        last = last.replace(tzinfo=timezone.utc)
    return now_utc() - last > timedelta(minutes=SESSION_TIMEOUT_MINUTES)


# ---- Routes ------------------------------------------------------------------

@app.get("/health")
def health() -> tuple[Response, int]:
    return jsonify({"status": "ok"}), 200


@app.post("/session/start")
def start_session() -> tuple[Response, int]:
    body = request.get_json(silent=True) or {}
    role = body.get("role")
    if not role:
        return err("role is required", "MISSING_FIELD", 400)
    if role not in ALLOWED_ROLES:
        return err(f"role must be one of {ALLOWED_ROLES}", "INVALID_ROLE", 400)

    try:
        first_question = get_next_turn(role=role, history=[], last_answer=None)
    except Exception as e:
        logger.exception("Engine failed on first turn")
        return err(str(e), "GEMINI_FAILED", 500)

    session_id = uuid.uuid4().hex
    now = now_utc()
    doc = {
        "role": role,
        "status": "active",
        "createdAt": now,
        "lastActivityAt": now,
        "turns": [{"answer": None, "response": first_question}],
    }
    safe_firestore_set(session_ref(session_id), doc)

    return jsonify({"session_id": session_id, "question": first_question}), 200


@app.post("/session/<session_id>/answer")
def submit_answer(session_id: str) -> tuple[Response, int]:
    body = request.get_json(silent=True) or {}
    answer = body.get("answer")
    if not isinstance(answer, str) or not answer.strip():
        return err("answer is required", "MISSING_FIELD", 400)

    ref = session_ref(session_id)
    snap = ref.get()
    if not snap.exists:
        return err("session not found", "SESSION_NOT_FOUND", 404)

    session = snap.to_dict() or {}

    if is_expired(session):
        safe_firestore_set(ref, {"status": "expired"})
        return err("session expired", "SESSION_EXPIRED", 410)

    if session.get("status") == "complete":
        return err("session already complete", "SESSION_COMPLETE", 409)

    role = session.get("role")
    turns: list[dict[str, Any]] = session.get("turns") or []
    if not turns:
        return err("session has no questions", "SESSION_CORRUPT", 500)

    # Attach the answer to the most recent turn
    turns[-1]["answer"] = answer.strip()
    turn_number = len(turns)  # 1-indexed: this is the turn just answered

    if turn_number >= TOTAL_TURNS:
        # Final answer — evaluate but don't generate a new question
        try:
            final_eval_payload = get_next_turn(
                role=role, history=turns, last_answer=answer.strip()
            )
            final_evaluation = final_eval_payload.get("evaluation")
        except Exception as e:
            logger.exception("Engine failed scoring the final answer")
            final_evaluation = {
                "score": 5,
                "feedback": "Final evaluation unavailable.",
                "keywords_matched": [],
                "keywords_missing": [],
            }

        # Stamp the evaluation onto the just-answered turn so the report can use it
        if isinstance(final_evaluation, dict):
            turns[-1].setdefault("response", {})["evaluation"] = final_evaluation

        safe_firestore_set(ref, {
            "turns": turns,
            "status": "complete",
            "lastActivityAt": now_utc(),
            "completedAt": now_utc(),
        })
        return jsonify({"done": True, "session_id": session_id}), 200

    # Mid-interview: generate next question with evaluation of the answer just given
    try:
        next_payload = get_next_turn(role=role, history=turns, last_answer=answer.strip())
    except Exception as e:
        logger.exception("Engine failed generating next turn")
        return err(str(e), "GEMINI_FAILED", 500)

    evaluation = next_payload.get("evaluation")
    # Stamp evaluation onto the previous turn (the one just answered)
    if isinstance(evaluation, dict):
        turns[-1].setdefault("response", {})["evaluation"] = evaluation

    # Build the next turn record (no answer yet, no evaluation yet)
    next_question_only = {
        "question": next_payload["question"],
        "difficulty": next_payload["difficulty"],
        "skills_tested": next_payload["skills_tested"],
        "evaluation": None,
    }
    turns.append({"answer": None, "response": next_question_only})

    safe_firestore_set(ref, {
        "turns": turns,
        "lastActivityAt": now_utc(),
    })

    return jsonify({
        "done": False,
        "turn_number": len(turns),
        "evaluation": evaluation,
        "next_question": next_question_only,
    }), 200


@app.get("/session/<session_id>/report")
def get_report(session_id: str) -> tuple[Response, int]:
    ref = session_ref(session_id)
    snap = ref.get()
    if not snap.exists:
        return err("session not found", "SESSION_NOT_FOUND", 404)

    session = snap.to_dict() or {}
    role = session.get("role")
    turns = session.get("turns") or []

    # Idempotent: if already computed, return cached
    cached = session.get("report")
    if isinstance(cached, dict) and cached.get("skill_scores"):
        return jsonify(cached), 200

    try:
        report = generate_final_report(role=role, turns=turns)
    except Exception as e:
        logger.exception("Report generation failed")
        return err(str(e), "GEMINI_FAILED", 500)

    safe_firestore_set(ref, {"report": report})
    return jsonify(report), 200


@app.post("/transcribe")
def transcribe() -> tuple[Response, int]:
    audio_file = request.files.get("audio")
    if audio_file is None:
        return err("audio file is required (multipart 'audio')", "MISSING_FIELD", 400)

    audio_bytes = audio_file.read()
    if not audio_bytes:
        return err("audio file is empty", "MISSING_FIELD", 400)

    try:
        config = speech.RecognitionConfig(
            encoding=speech.RecognitionConfig.AudioEncoding.WEBM_OPUS,
            sample_rate_hertz=48000,
            language_code="en-US",
            enable_automatic_punctuation=True,
        )
        audio = speech.RecognitionAudio(content=audio_bytes)
        response = stt().recognize(config=config, audio=audio)
        transcript = " ".join(
            r.alternatives[0].transcript
            for r in response.results
            if r.alternatives
        ).strip()
    except Exception as e:
        logger.exception("STT failed")
        return err(str(e), "STT_FAILED", 500)

    return jsonify({"transcript": transcript}), 200


@app.post("/speak")
def speak() -> tuple[Response, int] | Response:
    body = request.get_json(silent=True) or {}
    text = body.get("text")
    if not isinstance(text, str) or not text.strip():
        return err("text is required", "MISSING_FIELD", 400)

    try:
        synthesis_input = texttospeech.SynthesisInput(text=text.strip())
        voice = texttospeech.VoiceSelectionParams(
            language_code="en-US",
            name=TTS_VOICE_NAME,
        )
        audio_config = texttospeech.AudioConfig(
            audio_encoding=texttospeech.AudioEncoding.MP3,
            speaking_rate=1.0,
        )
        response = tts().synthesize_speech(
            input=synthesis_input, voice=voice, audio_config=audio_config
        )
    except Exception as e:
        logger.exception("TTS failed")
        return err(str(e), "TTS_FAILED", 500)

    return Response(response.audio_content, mimetype="audio/mp3")


@app.errorhandler(404)
def not_found(_e):  # type: ignore[no-untyped-def]
    return err("route not found", "NOT_FOUND", 404)


@app.errorhandler(500)
def server_error(_e):  # type: ignore[no-untyped-def]
    return err("internal server error", "SERVER_ERROR", 500)


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    debug = os.getenv("FLASK_ENV", "development") == "development"
    app.run(host="0.0.0.0", port=port, debug=debug)
