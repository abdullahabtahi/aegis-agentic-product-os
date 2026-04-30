"""Action Executor — Component 5 of the Aegis pipeline.

Type: Deterministic ADK BaseAgent subclass — NOT an LLM agent.
Executes founder-approved interventions via Linear MCP writes.

Key design decisions (CLAUDE.md):
- Only runs after Governor approves AND founder accepts
- Bounded LinearAction writes only (add_comment, create_issue, etc.)
- Jules actions are stubbed (requirePlanApproval=True, no real API)
- Never improvises actions beyond LinearAction interface
- Uses same checkpoint pattern as Signal Engine and Governor

Two-invocation model:
  Invocation 1: Pipeline halts at Governor → awaiting_founder_approval
  External:     approve_intervention() transitions state
  Invocation 2: Prior agents skip via checkpoint → Executor runs

Writes to session state:
  "executor_result"           → ExecutorResult dict
  "pipeline_status"           → "executed" | "execution_failed"
  "pipeline_checkpoint"       → "executor_complete"
  "outcome_check_scheduled_at" → ISO 8601 (14 days from now)
"""

from __future__ import annotations

from collections.abc import AsyncGenerator
from datetime import datetime, timedelta, timezone

from google.adk.agents import BaseAgent
from google.adk.agents.invocation_context import InvocationContext
from google.adk.events import Event
from google.genai import types

from models.responses import ExecutorResult
from tools.linear_tools import MockLinearMCP, RealLinearMCP, get_linear_mcp

# Union type alias
LinearMCPClient = MockLinearMCP | RealLinearMCP

_OUTCOME_CHECK_DELAY_DAYS = 14


def _build_linear_action_from_proposal(proposal: dict) -> dict | None:
    """Extract a LinearAction dict from the coordinator's intervention proposal.

    Maps coordinator tool output fields to the LinearAction schema:
    - proposed_comment → add_comment
    - proposed_issue_title + proposed_issue_description → create_issue
    """
    action_type = proposal.get("action_type", "")

    # Actions that create a Linear issue
    issue_title = proposal.get("proposed_issue_title", "")
    issue_desc = proposal.get("proposed_issue_description", "")
    if issue_title and issue_desc:
        return {
            "create_issue": {
                "title": issue_title,
                "description": issue_desc,
                "project_id": None,
                "label": action_type,
            },
        }

    # Actions that add a comment
    comment = proposal.get("proposed_comment", "")
    if comment:
        return {"add_comment": comment}

    # no_intervention or actions without a concrete Linear write
    return None


class ExecutorAgent(BaseAgent):
    """Deterministic executor — writes to Linear after founder approval.

    Reads from session state, executes the approved intervention,
    writes results back to session state.

    Session state keys read:
      "pipeline_status"               → must be "founder_approved" to execute
      "pipeline_checkpoint"           → skip if "executor_complete"
      "awaiting_approval_intervention" → the approved intervention payload

    Session state keys written:
      "executor_result"               → ExecutorResult dict
      "pipeline_status"               → "executed" | "execution_failed"
      "pipeline_checkpoint"           → "executor_complete"
      "outcome_check_scheduled_at"    → ISO 8601 (14 days from now)
    """

    async def _run_async_impl(
        self, ctx: InvocationContext
    ) -> AsyncGenerator[Event, None]:
        # Lazy-init the Linear MCP client (can't store as class attr —
        # httpx.AsyncClient contains an RLock which Pydantic can't deepcopy)
        linear_mcp = get_linear_mcp()
        # Checkpoint guard — skip if already completed
        checkpoint = ctx.session.state.get("pipeline_checkpoint", "")
        if checkpoint == "executor_complete":
            yield Event(
                invocation_id=ctx.invocation_id,
                author=self.name,
                content=types.Content(
                    role="model",
                    parts=[
                        types.Part.from_text(
                            text="[Executor] Skipped — checkpoint exists"
                        )
                    ],
                ),
            )
            return

        # Only execute if founder approved
        pipeline_status = ctx.session.state.get("pipeline_status", "")
        if pipeline_status != "approved":
            yield Event(
                invocation_id=ctx.invocation_id,
                author=self.name,
                content=types.Content(
                    role="model",
                    parts=[
                        types.Part.from_text(
                            text=f"[Executor] Skipped — pipeline_status='{pipeline_status}', need 'approved'"
                        )
                    ],
                ),
            )
            return

        proposal = ctx.session.state.get("awaiting_approval_intervention", {})
        action_type = proposal.get("action_type", "no_intervention")

        # Handle no_intervention
        if action_type == "no_intervention":
            result = ExecutorResult(
                executed=False,
                action_type=action_type,
                error=None,
            )
            ctx.session.state["executor_result"] = result.model_dump()
            ctx.session.state["pipeline_status"] = "complete"
            ctx.session.state["pipeline_checkpoint"] = "executor_complete"
            yield Event(
                invocation_id=ctx.invocation_id,
                author=self.name,
                content=types.Content(
                    role="model",
                    parts=[
                        types.Part.from_text(
                            text="[Executor] no_intervention — nothing to execute"
                        )
                    ],
                ),
            )
            return

        # Handle Jules actions — requires GitHub + JULES_API_KEY (not yet configured).
        # Governor's jules_gate check (#4) blocks these in normal pipeline flow;
        # this stub handles any case that slips through and makes the gap explicit.
        if action_type.startswith("jules_"):
            workspace = ctx.session.state.get("workspace", {})
            github_repo = workspace.get("github_repo", "")

            jules_result = {
                "status": "not_available",
                "error": (
                    f"Jules integration is not configured (JULES_API_KEY not set). "
                    f"Action '{action_type}' requires Jules API access. "
                    "Connect Jules at https://jules.google.com to enable this."
                ),
                "session_id": None,
                "jules_url": None,
            }

            executed = jules_result.get("status") == "session_created"
            result = ExecutorResult(
                executed=executed,
                action_type=action_type,
                jules_session_result=jules_result,
                error=jules_result.get("error") if not executed else None,
            )
            ctx.session.state["executor_result"] = result.model_dump()
            ctx.session.state["pipeline_status"] = (
                "complete" if executed else "error"
            )
            ctx.session.state["pipeline_checkpoint"] = "executor_complete"
            if executed:
                ctx.session.state["jules_session_id"] = jules_result.get(
                    "session_id", ""
                )
                ctx.session.state["jules_url"] = jules_result.get("jules_url", "")
                ctx.session.state["outcome_check_scheduled_at"] = (
                    datetime.now(timezone.utc)
                    + timedelta(days=_OUTCOME_CHECK_DELAY_DAYS)
                ).isoformat()

            status = jules_result.get("status", "error")
            msg = f"[Executor] Jules {action_type} — {status}"
            if executed:
                msg += f" (session: {jules_result.get('session_id', '')}, plan approval required)"

            yield Event(
                invocation_id=ctx.invocation_id,
                author=self.name,
                content=types.Content(
                    role="model",
                    parts=[types.Part.from_text(text=msg)],
                ),
            )
            return

        # Handle Linear actions
        linear_action = _build_linear_action_from_proposal(proposal)
        if linear_action is None:
            # No concrete Linear write mapped — treat as executed with no write
            result = ExecutorResult(
                executed=True,
                action_type=action_type,
                linear_write_result={"status": "no_linear_action_mapped"},
            )
            ctx.session.state["executor_result"] = result.model_dump()
            ctx.session.state["pipeline_status"] = "complete"
            ctx.session.state["pipeline_checkpoint"] = "executor_complete"
            yield Event(
                invocation_id=ctx.invocation_id,
                author=self.name,
                content=types.Content(
                    role="model",
                    parts=[
                        types.Part.from_text(
                            text=f"[Executor] {action_type} — no Linear action mapped, marked complete"
                        )
                    ],
                ),
            )
            return

        try:
            write_result = await linear_mcp.write_action(linear_action)
            result = ExecutorResult(
                executed=True,
                action_type=action_type,
                linear_write_result=write_result,
            )
            ctx.session.state["executor_result"] = result.model_dump()
            ctx.session.state["pipeline_status"] = "complete"
            ctx.session.state["pipeline_checkpoint"] = "executor_complete"
            ctx.session.state["outcome_check_scheduled_at"] = (
                datetime.now(timezone.utc) + timedelta(days=_OUTCOME_CHECK_DELAY_DAYS)
            ).isoformat()
            msg = f"[Executor] {action_type} — Linear write successful: {write_result.get('status', 'ok')}"

        except Exception as exc:
            result = ExecutorResult(
                executed=False,
                action_type=action_type,
                error=str(exc),
            )
            ctx.session.state["executor_result"] = result.model_dump()
            ctx.session.state["pipeline_status"] = "error"
            ctx.session.state["pipeline_checkpoint"] = "executor_complete"
            msg = f"[Executor] FAILED — {action_type}: {exc}"

        yield Event(
            invocation_id=ctx.invocation_id,
            author=self.name,
            content=types.Content(
                role="model",
                parts=[types.Part.from_text(text=msg)],
            ),
        )


def create_executor_agent() -> ExecutorAgent:
    """Factory — always returns a fresh instance with no pre-existing parent.

    See signal_engine.py factory comment for why singletons break ADK eval.
    """
    return ExecutorAgent(
        name="executor",
        description="Deterministic executor — writes founder-approved interventions to Linear.",
    )
