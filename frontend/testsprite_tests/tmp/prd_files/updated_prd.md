# Aegis Agentic Product OS — Project PRD

**Version:** 2.0 (Post-Stabilization)  
**Date:** 2026-04-08  
**Status:** Implementation Ready / Reference for TestSprite  

---

## 1. Product Overview
Aegis is an agentic command center for startup founders. It scans high-velocity project data (Linear) to detect strategic risks (execution drift, strategy-doc mismatch, missing metrics) and proposes interventions using an adversarial multi-agent debate pipeline.

## 2. User Journey (The "Golden Path")

### 🚀 Step 1: Connecting the Workspace
The founder connects Aegis to their **Linear Workspace**. The Signal Engine performs an initial baseline scan of all issues from the last 14 days.

### 🔍 Step 2: Continuous Discovery
The founder clicks **"Scan Linear"** on the Directions dashboard. Aegis (Gemini Flash) clusters recent issues into suggested strategic themes (Status: `detecting`). The founder reviews these suggestions and promotes one to a **"Bet"** by adding a core hypothesis.

### 🧠 Step 3: Adversarial Monitoring
The **Product Brain** agents (Cynic, Optimist, Strategist) run automated debates every time significant drift is detected (e.g., chronic ticket rollover or missing success metrics).

### ⚡ Step 4: Intelligent Intervention
Aegis surfaces a **Risk Signal** in the Mission Control panel. It proposes a specific **Intervention** (e.g., "Kill this project" or "Refactor the blocker").

### ✅ Step 5: Resolution
The founder approves the intervention. Aegis (Governor Level 3) autonomously executes the change in Linear or kicks off a **Jules** codebase modification task.

## 3. Target Audience
*   **Founders & Product Leads:** Who need strategic oversight without manually reading every Linear ticket.
*   **Agentic Developers:** Using Google ADK for high-complexity reasoning tasks.

## 3. Core Features 

### 3.1 Signal Engine (L1 - Detection)
*   **Linear Ingestion:** Scans issues/projects within a sliding 14-day window.
*   **Heuristic Matching:** Identifies Evidence (chronic rollover, missing hypothesis, scope creep).
*   **Automatic Discovery:** NEW — Manual trigger to cluster 50+ raw issues into "Proposed Directions" (Status: `detecting`).

### 3.2 Product Brain (L2 - Reasoning)
*   **Adversarial Debate:** A SequentialAgent pipeline (Cynic → Optimist → Synthesis).
*   **Role-Play Stability:** Unified toolset across agents to prevent ToolNotFound errors in production/eval.
*   **Agent Models:** Gemini 1.5 Flash (critique) and Gemini 1.5 Pro (synthesis).

### 3.3 Governor (L3 - Guardrails)
*   **Decision Policy:** Filters interventions based on control levels:
    *   `draft_only`: Founder earns trust first.
    *   `require_approval`: (Default) Human-in-the-loop.
    *   `autonomous_low_risk`: Automated low-impact Linear writes.
*   **Jules Gate:** Safety check for autonomous codebase modifications (Phase 6+).

### 3.4 Mission Control (UI/UX)
*   **Theme:** Premium Light Glassmorphism (`slate-900` text, `bg-white/60` glass panels).
*   **Dashboard:** Real-time health scoring (0–100) and strategic bet tracking.

## 4. Technical Architecture

### 4.1 Backend
*   **Framework:** FastAPI + SQLAlchemy.
*   **Orchestration:** Google Agent Development Kit (ADK).
*   **Database:** AlloyDB (PostgreSQL) compatible (currently SQLite/Memory for eval).

### 4.2 Frontend
*   **Framework:** Next.js 14+ (App Router).
*   **Styling:** Tailwind CSS + Lucide Icons.
*   **Data Fetching:** TanStack Query (8s polling for agent-driven updates).

## 5. Persistence & Data Schema
*   **Identities:** UUID-based (string representation).
*   **State:** Implements the "Never Mutate" rule; all pipeline updates return model copies.
*   **Embeddings:** Ready for `pgvector` in AlloyDB to detect "Failure Patterns" across signals.

## 6. Success Metrics
*   **Precision:** Zero tool hallucinations in the Product Brain debate.
*   **Discovery:** Auto-clustering accurately groups related issues into a strategic theme > 80% of the time.
*   **Stability:** Build passes all Trace 01-03 Golden Traces in the evaluation suite.
