"""Shared in-memory bet store — local dev fallback when no DB is configured.

In production (Cloud SQL), bets are persisted via db.repository.save_bet().
In local dev without a DB, both the REST endpoint (main.py) and the
conversational agent tool (declare_direction) write here so GET /bets
reflects bets declared via chat AND via the modal form.
"""

inmemory_bets: list[dict] = []
