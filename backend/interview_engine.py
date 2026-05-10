"""
Plumo — Gemini-powered interview engine.

Encapsulates all Vertex AI Gemini interaction. Returns structured JSON only.
Never call Gemini from outside this module — main.py imports get_next_turn
and generate_final_report and treats them as black boxes.
"""

from __future__ import annotations

import json
import logging
import os
from statistics import mean
from typing import Any

import vertexai
from vertexai.generative_models import GenerationConfig, GenerativeModel

logger = logging.getLogger(__name__)

ALLOWED_ROLES = [
    "SDE Intern",
    "Backend Engineer",
    "Frontend Engineer",
    "Full Stack Engineer",
    "ML Engineer",
    "Data Analyst",
    "DevOps Engineer",
]

ALLOWED_SKILLS = [
    "DSA",
    "System Design",
    "SQL",
    "OOP",
    "Behavioral",
    "Communication",
]

ALLOWED_DIFFICULTIES = ("easy", "medium", "hard")

TOTAL_TURNS = 8

FALLBACK_QUESTION = {
    "question": "Can you walk me through how you'd approach debugging a production issue?",
    "difficulty": "medium",
    "skills_tested": ["Behavioral"],
    "evaluation": None,
}

FALLBACK_ROADMAP = [
    {
        "week": 1,
        "focus": "Strengthen weak fundamentals identified in this interview",
        "resources": [
            "https://leetcode.com/problemset/",
            "https://www.designgurus.io/",
        ],
    },
    {
        "week": 2,
        "focus": "Apply learnings to mock interviews and build confidence",
        "resources": [
            "https://www.pramp.com/",
            "https://interviewing.io/",
        ],
    },
]


_initialized = False


def _init_vertex() -> None:
    """Initialize Vertex AI on first use. Idempotent."""
    global _initialized
    if _initialized:
        return
    project = os.getenv("GCP_PROJECT")
    if not project:
        raise RuntimeError("GCP_PROJECT env var not set")
    location = os.getenv("GCP_LOCATION", "us-central1")
    vertexai.init(project=project, location=location)
    _initialized = True


def _model() -> GenerativeModel:
    _init_vertex()
    model_name = os.getenv("GEMINI_MODEL", "gemini-2.5-pro")
    return GenerativeModel(model_name)


def _json_call(prompt: str) -> dict[str, Any] | list[Any]:
    """
    Call Gemini with JSON-only response mode. Retries once on parse failure.
    Raises on second failure — caller decides how to recover.
    """
    config = GenerationConfig(
        response_mime_type="application/json",
        temperature=0.7,
    )
    model = _model()
    last_error: Exception | None = None
    for attempt in (1, 2):
        try:
            resp = model.generate_content(prompt, generation_config=config)
            text = resp.text or ""
            return json.loads(text)
        except (json.JSONDecodeError, ValueError) as e:
            last_error = e
            logger.warning("Gemini returned invalid JSON (attempt %d): %s", attempt, e)
        except Exception as e:
            last_error = e
            logger.warning("Gemini call failed (attempt %d): %s", attempt, e)
    raise RuntimeError(f"Gemini call failed after retry: {last_error}")


def _validate_role(role: str) -> None:
    if role not in ALLOWED_ROLES:
        raise ValueError(f"Role '{role}' not in ALLOWED_ROLES")


def _next_difficulty(last_score: int | None) -> str:
    """Adjust difficulty based on most recent score. Used as a hint to Gemini."""
    if last_score is None:
        return "easy"
    if last_score < 5:
        return "easy"
    if last_score > 7:
        return "hard"
    return "medium"


def _build_question_prompt(
    role: str,
    history: list[dict[str, Any]],
    last_answer: str | None,
    target_difficulty: str,
) -> str:
    """
    Build the prompt for the next question. If last_answer is provided, also
    asks Gemini to evaluate it in the same call.
    """
    asked = [t["response"]["question"] for t in history if t.get("response")]
    asked_block = ""
    if asked:
        asked_block = (
            "\nQuestions already asked (do not repeat or rephrase):\n"
            + "\n".join(f"- {q}" for q in asked)
        )

    eval_instruction = ""
    eval_schema = '"evaluation": null'
    if last_answer is not None and history:
        last_question = history[-1]["response"]["question"]
        eval_instruction = (
            f"\nThe candidate just answered the previous question:\n"
            f'  Previous question: "{last_question}"\n'
            f'  Candidate answer: "{last_answer}"\n'
            "First, evaluate the candidate answer. Then generate the NEXT question.\n"
            "The evaluation field of your response should describe the previous answer, "
            "but the question/difficulty/skills_tested fields describe the NEW question.\n"
        )
        eval_schema = (
            '"evaluation": { '
            '"score": <integer 1-10>, '
            '"feedback": "<2-3 sentences, specific and actionable>", '
            '"keywords_matched": ["<technical terms the candidate used correctly>"], '
            '"keywords_missing": ["<key terms they should have mentioned>"] '
            "}"
        )

    skills_list = ", ".join(f'"{s}"' for s in ALLOWED_SKILLS)

    return f"""You are a strict but fair technical interviewer for a {role} position at a top-tier tech company.
You have already asked {len(asked)} of {TOTAL_TURNS} questions in this session.
{asked_block}
{eval_instruction}
Now generate the next interview question.

Difficulty calibration:
- Target difficulty for this question: {target_difficulty}
- Adjust if the candidate is clearly over- or under-performing.

Skill coverage:
- Pick 1-2 skills from this list: [{skills_list}]
- Try to cover skills you haven't tested yet over the course of the interview.
- For a {role}, weight technical skills appropriately (e.g. ML Engineer → favor System Design, DSA; Data Analyst → favor SQL, Communication).

Output STRICT JSON matching this exact shape, no extra fields, no commentary:
{{
  "question": "<the next interview question, one or two sentences>",
  "difficulty": "<easy|medium|hard>",
  "skills_tested": ["<skill1>", "<skill2 optional>"],
  {eval_schema}
}}"""


def _coerce_question(raw: dict[str, Any], expect_evaluation: bool) -> dict[str, Any]:
    """Validate and normalize a question payload from Gemini."""
    if not isinstance(raw, dict):
        raise ValueError("Gemini response is not a JSON object")

    question = raw.get("question")
    difficulty = raw.get("difficulty")
    skills = raw.get("skills_tested")

    if not isinstance(question, str) or not question.strip():
        raise ValueError("Missing or invalid 'question'")
    if difficulty not in ALLOWED_DIFFICULTIES:
        difficulty = "medium"
    if not isinstance(skills, list) or not skills:
        skills = ["Communication"]
    skills = [s for s in skills if s in ALLOWED_SKILLS] or ["Communication"]

    out: dict[str, Any] = {
        "question": question.strip(),
        "difficulty": difficulty,
        "skills_tested": skills,
        "evaluation": None,
    }

    if expect_evaluation:
        ev = raw.get("evaluation")
        if isinstance(ev, dict):
            score = ev.get("score")
            try:
                score_int = max(1, min(10, int(score)))
            except (TypeError, ValueError):
                score_int = 5
            feedback = ev.get("feedback") if isinstance(ev.get("feedback"), str) else ""
            matched = ev.get("keywords_matched")
            missing = ev.get("keywords_missing")
            out["evaluation"] = {
                "score": score_int,
                "feedback": feedback or "No specific feedback was generated.",
                "keywords_matched": matched if isinstance(matched, list) else [],
                "keywords_missing": missing if isinstance(missing, list) else [],
            }
        else:
            out["evaluation"] = {
                "score": 5,
                "feedback": "Evaluation could not be generated for this answer.",
                "keywords_matched": [],
                "keywords_missing": [],
            }

    return out


def get_next_turn(
    role: str,
    history: list[dict[str, Any]],
    last_answer: str | None,
) -> dict[str, Any]:
    """
    Return the next question payload (with evaluation of last_answer if given).

    `history` is the list of turns already stored in the session, in order.
    Each turn has shape: {"answer": str|None, "response": {...question payload...}}.
    On the very first turn, history should be [] and last_answer should be None.
    """
    _validate_role(role)

    last_score: int | None = None
    if history:
        last_eval = history[-1].get("response", {}).get("evaluation")
        if isinstance(last_eval, dict):
            last_score = last_eval.get("score")

    target = _next_difficulty(last_score)
    expect_eval = last_answer is not None and bool(history)
    prompt = _build_question_prompt(role, history, last_answer, target)

    try:
        raw = _json_call(prompt)
        return _coerce_question(raw, expect_evaluation=expect_eval)
    except Exception as e:
        logger.error("Falling back to canned question: %s", e)
        fallback = json.loads(json.dumps(FALLBACK_QUESTION))  # deep copy
        if expect_eval:
            fallback["evaluation"] = {
                "score": 5,
                "feedback": "Evaluation unavailable for this answer due to a service error.",
                "keywords_matched": [],
                "keywords_missing": [],
            }
        return fallback


def aggregate_skill_scores(turns: list[dict[str, Any]]) -> dict[str, float]:
    """Average score per skill across all evaluated turns."""
    buckets: dict[str, list[int]] = {}
    for turn in turns:
        response = turn.get("response") or {}
        evaluation = response.get("evaluation")
        if not isinstance(evaluation, dict):
            continue
        score = evaluation.get("score")
        if not isinstance(score, (int, float)):
            continue
        for skill in response.get("skills_tested", []):
            buckets.setdefault(skill, []).append(int(score))
    return {skill: round(mean(scores), 2) for skill, scores in buckets.items() if scores}


def detect_weak_areas(skill_scores: dict[str, float], threshold: float = 6.0) -> list[str]:
    return [skill for skill, avg in skill_scores.items() if avg < threshold]


def _build_roadmap_prompt(
    role: str, skill_scores: dict[str, float], weak_areas: list[str]
) -> str:
    return f"""You are a career coach helping a candidate prepare for a {role} role.
Their interview is over. Here are their average skill scores (0-10):
{json.dumps(skill_scores, indent=2)}

Weak areas (below 6/10): {weak_areas or "none — focus on stretching the candidate"}

Generate a 2-week learning roadmap focused on the weak areas (or stretch goals if there are none).
Each week must have a clear focus and 2-4 concrete, real, well-known resources (links, books, or platforms).
Resources should be specific and reputable — no made-up URLs.

Output STRICT JSON, no commentary, matching this exact shape:
{{
  "roadmap": [
    {{ "week": 1, "focus": "<focus area>", "resources": ["<resource 1>", "<resource 2>"] }},
    {{ "week": 2, "focus": "<focus area>", "resources": ["<resource 1>", "<resource 2>"] }}
  ]
}}"""


def _coerce_roadmap(raw: Any) -> list[dict[str, Any]]:
    if isinstance(raw, dict) and isinstance(raw.get("roadmap"), list):
        items = raw["roadmap"]
    elif isinstance(raw, list):
        items = raw
    else:
        raise ValueError("Roadmap response is not a list or {roadmap: [...]}")

    cleaned: list[dict[str, Any]] = []
    for i, item in enumerate(items[:2], start=1):
        if not isinstance(item, dict):
            continue
        focus = item.get("focus") if isinstance(item.get("focus"), str) else "Continued practice"
        resources = item.get("resources") if isinstance(item.get("resources"), list) else []
        resources = [r for r in resources if isinstance(r, str) and r.strip()]
        cleaned.append({"week": i, "focus": focus, "resources": resources or ["leetcode.com"]})
    if not cleaned:
        raise ValueError("Roadmap items could not be parsed")
    while len(cleaned) < 2:
        cleaned.append({
            "week": len(cleaned) + 1,
            "focus": "Continued practice and mock interviews",
            "resources": ["https://www.pramp.com/", "https://interviewing.io/"],
        })
    return cleaned


def generate_final_report(role: str, turns: list[dict[str, Any]]) -> dict[str, Any]:
    """
    Aggregate skill scores from completed turns, detect weak areas, and ask
    Gemini for a 2-week learning roadmap. Returns the full report dict.
    """
    _validate_role(role)
    skill_scores = aggregate_skill_scores(turns)
    weak_areas = detect_weak_areas(skill_scores)

    try:
        raw = _json_call(_build_roadmap_prompt(role, skill_scores, weak_areas))
        roadmap = _coerce_roadmap(raw)
    except Exception as e:
        logger.error("Falling back to canned roadmap: %s", e)
        roadmap = json.loads(json.dumps(FALLBACK_ROADMAP))

    return {
        "skill_scores": skill_scores,
        "weak_areas": weak_areas,
        "roadmap": roadmap,
    }


# ---- Standalone smoke test ---------------------------------------------------

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")

    role = "SDE Intern"
    print(f"=== Smoke test: {role} ===\n")

    print("[Turn 1] Generating first question (no answer yet)...")
    first = get_next_turn(role, history=[], last_answer=None)
    print(json.dumps(first, indent=2))

    print("\n[Turn 2] Submitting a sample answer and asking for next question...")
    history = [{"answer": None, "response": first}]
    sample_answer = (
        "I would use a hash map to store seen values and check for the complement "
        "of each number as I iterate through the array. That gives O(n) time and O(n) space."
    )
    second = get_next_turn(role, history=history, last_answer=sample_answer)
    print(json.dumps(second, indent=2))

    print("\n[Report] Generating a tiny report from the 2 turns above...")
    history.append({"answer": sample_answer, "response": second})
    report = generate_final_report(role, history)
    print(json.dumps(report, indent=2))
