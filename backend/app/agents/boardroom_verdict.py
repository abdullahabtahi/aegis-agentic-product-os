"""Boardroom Verdict Agent — Component of Feature 011.

Type: ADK LlmAgent with structured output (Pydantic schema).
Invoked asynchronously after a boardroom session ends.
Reads all turns from boardroom_turns, synthesises a structured verdict,
and writes it to boardroom_verdicts.

Output schema mirrors BoardroomVerdict frontend type.
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone

from google.adk.agents import LlmAgent
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types as genai_types
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

_MODEL = "gemini-3-flash-preview"


# ─────────────────────────────────────────────
# Output schema
# ─────────────────────────────────────────────

class VerdictRisk(BaseModel):
    text: str
    severity: str = Field(..., pattern="^(low|medium|high)$")


class VerdictExperiment(BaseModel):
    text: str
    timeframe: str


class BoardroomVerdictOutput(BaseModel):
    confidence_score: int = Field(..., ge=0, le=100)
    recommendation: str = Field(..., pattern="^(proceed|pause|pivot)$")
    summary: str = Field(..., min_length=10)
    key_risks: list[VerdictRisk] = Field(default_factory=list)
    next_experiments: list[VerdictExperiment] = Field(default_factory=list)
    bear_assessment: str | None = None
    bull_assessment: str | None = None
    sage_assessment: str | None = None
    sage_voice_summary: str | None = None


# ─────────────────────────────────────────────
# Verdict prompt builder
# ─────────────────────────────────────────────

def _build_verdict_prompt(turns: list[dict], session: dict) -> str:
    transcript = "\n".join(
        f"[{t['speaker'].upper()}]: {t['text']}"
        for t in sorted(turns, key=lambda x: x.get("sequence_number", 0))
    )
    return f"""You are synthesising a boardroom session verdict.

Session context:
- Decision: {session.get('decision_question', 'Unknown')}
- Key assumption tested: {session.get('key_assumption', 'Unknown')}

Full transcript:
{transcript or 'No turns recorded.'}

Based on the discussion above, produce a structured verdict with:
1. confidence_score (0-100): How confident is the team in proceeding?
2. recommendation: "proceed", "pause", or "pivot"
3. summary: 2-3 sentences summarising the panel's conclusion
4. key_risks: Up to 5 risks raised, each with severity (low/medium/high)
5. next_experiments: Up to 4 concrete experiments with timeframes (e.g. "2 weeks")
6. bear_assessment: 1-2 sentences from Jordan (The Skeptic)'s perspective
7. bull_assessment: 1-2 sentences from Maya (The Champion)'s perspective
8. sage_assessment: 1-2 sentences from Ren (The Operator)'s synthesis
9. sage_voice_summary: 2-3 sentences Ren would say aloud to close the session (casual, spoken-word style)

Be specific. Reference actual points raised in the transcript."""


# ─────────────────────────────────────────────
# Agent factory
# ─────────────────────────────────────────────

def create_verdict_agent() -> LlmAgent:
    return LlmAgent(
        name="boardroom_verdict",
        model=_MODEL,
        description="Synthesises a structured verdict from a boardroom session transcript.",
        instruction=(
            "You are a structured verdict synthesiser for boardroom sessions. "
            "Always produce valid JSON matching the requested schema."
        ),
        output_schema=BoardroomVerdictOutput,
        output_key="verdict_output",
    )


# ─────────────────────────────────────────────
# Main entry point (called as background task)
# ─────────────────────────────────────────────

async def _invoke_verdict_llm(
    session_data: dict, turns: list[dict]
) -> BoardroomVerdictOutput:
    """Run the verdict ADK agent against the prepared transcript and parse output."""
    prompt = _build_verdict_prompt(turns, session_data)

    agent = create_verdict_agent()
    session_svc = InMemorySessionService()
    adk_session = await session_svc.create_session(
        app_name="verdict", user_id="system"
    )
    runner = Runner(
        agent=agent,
        app_name="verdict",
        session_service=session_svc,
    )

    output_text = ""
    async for event in runner.run_async(
        user_id="system",
        session_id=adk_session.id,
        new_message=genai_types.Content(
            role="user",
            parts=[genai_types.Part(text=prompt)],
        ),
    ):
        if (
            hasattr(event, "content")
            and event.content
            and hasattr(event.content, "parts")
        ):
            for part in event.content.parts:
                if hasattr(part, "text") and part.text:
                    output_text += part.text

    return _parse_verdict_output(output_text, adk_session, session_data)


async def run_verdict_agent_from_data(
    session_id: str, session_data: dict, turns: list[dict]
) -> dict | None:
    """Run the verdict agent on already-fetched data. Returns the verdict dict (no DB write)."""
    try:
        verdict_data = await _invoke_verdict_llm(session_data, turns)
        now = datetime.now(timezone.utc)
        verdict_id = str(uuid.uuid4())
        return {
            "id": verdict_id,
            "session_id": session_id,
            "bet_id": session_data.get("bet_id"),
            "confidence_score": verdict_data.confidence_score,
            "recommendation": verdict_data.recommendation,
            "summary": verdict_data.summary,
            "key_risks": [r.model_dump() for r in verdict_data.key_risks],
            "next_experiments": [e.model_dump() for e in verdict_data.next_experiments],
            "bear_assessment": verdict_data.bear_assessment,
            "bull_assessment": verdict_data.bull_assessment,
            "sage_assessment": verdict_data.sage_assessment,
            "sage_voice_summary": verdict_data.sage_voice_summary,
            "intervention_id": None,
            "created_at": now,
        }
    except Exception as exc:
        logger.error(
            "[verdict_agent] In-memory run failed for session %s: %s", session_id, exc, exc_info=True
        )
        return None


async def run_verdict_agent(session_id: str) -> None:
    """Fetch turns, run verdict agent, write result to boardroom_verdicts."""
    from db.engine import get_session, is_db_configured
    from sqlalchemy import text

    if not is_db_configured():
        logger.info("[verdict_agent] DB not configured; skipping for session %s", session_id)
        return

    try:
        async with get_session() as db:
            # Fetch session metadata
            s_result = await db.execute(
                text("SELECT * FROM boardroom_sessions WHERE id = :sid"),
                {"sid": session_id},
            )
            session_row = s_result.fetchone()
            if session_row is None:
                logger.warning("[verdict_agent] Session %s not found", session_id)
                return
            session_data = dict(session_row._mapping)

            # Fetch turns
            t_result = await db.execute(
                text(
                    "SELECT speaker, text, sequence_number FROM boardroom_turns "
                    "WHERE session_id = :sid ORDER BY sequence_number ASC"
                ),
                {"sid": session_id},
            )
            turns = [dict(r._mapping) for r in t_result]

        # Build prompt and run agent
        verdict_data = await _invoke_verdict_llm(session_data, turns)

        # Write to DB
        now = datetime.now(timezone.utc)  # asyncpg needs datetime, not ISO string
        verdict_id = str(uuid.uuid4())

        async with get_session() as db:
            await db.execute(
                text("""
                    INSERT INTO boardroom_verdicts
                        (id, session_id, bet_id, confidence_score, recommendation,
                         summary, key_risks, next_experiments,
                         bear_assessment, bull_assessment, sage_assessment,
                         sage_voice_summary, intervention_id, created_at)
                    VALUES
                        (:id, :sid, :bid, :conf, :rec,
                         :summary, :risks::jsonb, :exps::jsonb,
                         :bear, :bull, :sage,
                         :voice, NULL, :now)
                """),
                {
                    "id": verdict_id,
                    "sid": session_id,
                    "bid": session_data.get("bet_id"),
                    "conf": verdict_data.confidence_score,
                    "rec": verdict_data.recommendation,
                    "summary": verdict_data.summary,
                    "risks": json.dumps([r.model_dump() for r in verdict_data.key_risks]),
                    "exps": json.dumps([e.model_dump() for e in verdict_data.next_experiments]),
                    "bear": verdict_data.bear_assessment,
                    "bull": verdict_data.bull_assessment,
                    "sage": verdict_data.sage_assessment,
                    "voice": verdict_data.sage_voice_summary,
                    "now": now,
                },
            )

        logger.info("[verdict_agent] Verdict written for session %s", session_id)

    except Exception as exc:
        logger.error(
            "[verdict_agent] Failed for session %s: %s", session_id, exc, exc_info=True
        )


def _parse_verdict_output(
    raw: str, adk_session: object, session_data: dict
) -> BoardroomVerdictOutput:
    """Parse agent output; fall back to safe defaults on parse failure."""
    # Try to extract JSON from output (agent may wrap in markdown)
    clean = raw.strip()
    if "```" in clean:
        import re
        match = re.search(r"```(?:json)?\s*([\s\S]+?)\s*```", clean)
        if match:
            clean = match.group(1)

    try:
        data = json.loads(clean)
        return BoardroomVerdictOutput(**data)
    except Exception as exc:
        logger.warning("[verdict_agent] Parse failed (%s); using fallback verdict", exc)
        return BoardroomVerdictOutput(
            confidence_score=50,
            recommendation="pause",
            summary=(
                "The boardroom session concluded but the verdict could not be fully synthesised. "
                "Your transcript has been saved."
            ),
            key_risks=[],
            next_experiments=[],
            sage_voice_summary=(
                "We had a solid discussion. I'd suggest reviewing the transcript and "
                "reconnecting with the team before making a final call."
            ),
        )
