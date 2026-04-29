#!/usr/bin/env bash
# deploy.sh — Deploy Aegis to Cloud Run + Cloud SQL PostgreSQL
#
# DB choice: Cloud SQL g1-small (~$26/month) — same GCP project as Cloud Run,
# pgvector supported, easy upgrade path to AlloyDB later.
#
# Prerequisites:
#   gcloud auth login && gcloud auth application-default login
#   gcloud components install docker-credential-gcr
#   Required env vars: PROJECT_ID, DB_PASS
#   Optional env vars: LINEAR_API_KEY, REGION, DB_NAME, DB_USER
#
# Usage:
#   export PROJECT_ID=your-gcp-project
#   export DB_PASS=choose-a-strong-password
#   export LINEAR_API_KEY=lin_api_xxx   # optional, falls back to mock
#   bash deploy/deploy.sh

set -euo pipefail

# ─── Config ───────────────────────────────────────────────────────────────────

PROJECT_ID="${PROJECT_ID:?Set PROJECT_ID}"
REGION="${REGION:-us-central1}"
AR_REPO="${AR_REPO:-aegis}"
BACKEND_IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPO}/backend:latest"
FRONTEND_IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPO}/frontend:latest"

# Cloud SQL
SQL_INSTANCE="${SQL_INSTANCE:-aegis-db}"
DB_NAME="${DB_NAME:-aegis}"
DB_USER="${DB_USER:-aegis}"
DB_PASS="${DB_PASS:?Set DB_PASS}"
# Connection name used in Cloud Run unix socket path
SQL_CONNECTION_NAME="${PROJECT_ID}:${REGION}:${SQL_INSTANCE}"
# asyncpg URL via unix socket (no IP, no VPC connector needed)
DATABASE_URL="postgresql+asyncpg://${DB_USER}:${DB_PASS}@/${DB_NAME}?host=/cloudsql/${SQL_CONNECTION_NAME}"

# Cloud Run services
BACKEND_SERVICE="${BACKEND_SERVICE:-aegis-backend}"
FRONTEND_SERVICE="${FRONTEND_SERVICE:-aegis-frontend}"
LINEAR_API_KEY="${LINEAR_API_KEY:-}"
JULES_API_KEY="${JULES_API_KEY:-}"

# If no Linear key is provided, run in mock mode so the backend doesn't
# error-out on live Linear API calls in Cloud Run.
MOCK_LINEAR="false"
if [[ -z "${LINEAR_API_KEY}" ]]; then
  MOCK_LINEAR="true"
  echo "    No LINEAR_API_KEY set — AEGIS_MOCK_LINEAR=true (mock data)"
fi

echo "==> Project: ${PROJECT_ID}  Region: ${REGION}"

# ─── 1. Enable APIs ───────────────────────────────────────────────────────────

echo "==> Enabling required GCP APIs..."
gcloud services enable \
  sqladmin.googleapis.com \
  artifactregistry.googleapis.com \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  secretmanager.googleapis.com \
  aiplatform.googleapis.com \
  --project="${PROJECT_ID}" --quiet

# ─── 2. Artifact Registry ────────────────────────────────────────────────────

echo "==> Creating Artifact Registry repo (skips if exists)..."
gcloud artifacts repositories create "${AR_REPO}" \
  --repository-format=docker \
  --location="${REGION}" \
  --project="${PROJECT_ID}" \
  --quiet 2>/dev/null || true

gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet

# ─── 3. Cloud SQL instance ───────────────────────────────────────────────────
# db-g1-small: 1.7 GB RAM, shared vCPU, ~$26/month
# Upgrade to db-custom-2-7680 (2 vCPU, 7.5 GB) when ready to scale.

echo "==> Creating Cloud SQL instance (skips if exists, takes ~2 min)..."
gcloud sql instances create "${SQL_INSTANCE}" \
  --database-version=POSTGRES_16 \
  --tier=db-g1-small \
  --region="${REGION}" \
  --storage-size=10GB \
  --storage-auto-increase \
  --no-backup \
  --project="${PROJECT_ID}" \
  --quiet 2>/dev/null || echo "    Instance already exists — skipping."

# ─── 4. Database + user + pgvector ───────────────────────────────────────────

echo "==> Creating database and user (skips if exist)..."
gcloud sql databases create "${DB_NAME}" \
  --instance="${SQL_INSTANCE}" \
  --project="${PROJECT_ID}" \
  --quiet 2>/dev/null || true

gcloud sql users create "${DB_USER}" \
  --instance="${SQL_INSTANCE}" \
  --password="${DB_PASS}" \
  --project="${PROJECT_ID}" \
  --quiet 2>/dev/null || true

# Enable pgvector via Cloud SQL proxy (requires psql locally).
# Safe to skip — can be run manually later: CREATE EXTENSION IF NOT EXISTS vector;
if command -v psql &>/dev/null && [[ "${SKIP_DB_INIT:-false}" != "true" ]]; then
  echo "==> Enabling pgvector extension..."
  gcloud sql connect "${SQL_INSTANCE}" \
    --user=postgres \
    --project="${PROJECT_ID}" \
    --quiet <<SQL
CREATE EXTENSION IF NOT EXISTS vector;
GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};
SQL
  echo "    pgvector enabled."
else
  echo "    Skipping pgvector init (psql not found or SKIP_DB_INIT=true)."
  echo "    Run manually: gcloud sql connect ${SQL_INSTANCE} --user=postgres"
  echo "    Then: CREATE EXTENSION IF NOT EXISTS vector;"
fi

# ─── 5. Secrets (idempotent) ─────────────────────────────────────────────────

echo "==> Storing secrets in Secret Manager..."
echo -n "${DB_PASS}" | gcloud secrets create aegis-db-pass \
  --data-file=- --project="${PROJECT_ID}" --quiet 2>/dev/null || \
  echo -n "${DB_PASS}" | gcloud secrets versions add aegis-db-pass \
    --data-file=- --project="${PROJECT_ID}" --quiet

LINEAR_SECRET_EXISTS="false"
if [[ -n "${LINEAR_API_KEY}" ]]; then
  echo -n "${LINEAR_API_KEY}" | gcloud secrets create aegis-linear-key \
    --data-file=- --project="${PROJECT_ID}" --quiet 2>/dev/null || \
    echo -n "${LINEAR_API_KEY}" | gcloud secrets versions add aegis-linear-key \
      --data-file=- --project="${PROJECT_ID}" --quiet
  LINEAR_SECRET_EXISTS="true"
fi

JULES_SECRET_EXISTS="false"
if [[ -n "${JULES_API_KEY}" ]]; then
  echo -n "${JULES_API_KEY}" | gcloud secrets create aegis-jules-key \
    --data-file=- --project="${PROJECT_ID}" --quiet 2>/dev/null || \
    echo -n "${JULES_API_KEY}" | gcloud secrets versions add aegis-jules-key \
      --data-file=- --project="${PROJECT_ID}" --quiet
  JULES_SECRET_EXISTS="true"
fi

# ─── 6a. GCS artifact bucket ─────────────────────────────────────────────────
# ADK GcsArtifactService needs a bucket. InMemoryArtifactService loses data
# on Cloud Run scale-out (each instance has its own store).

ARTIFACT_BUCKET="${ARTIFACT_BUCKET:-${PROJECT_ID}-aegis-artifacts}"

echo "==> Creating GCS artifact bucket (skips if exists)..."
gcloud storage buckets create "gs://${ARTIFACT_BUCKET}" \
  --location="${REGION}" \
  --project="${PROJECT_ID}" \
  --uniform-bucket-level-access \
  --quiet 2>/dev/null || echo "    Bucket already exists — skipping."

# ─── 6. Build & push backend image ──────────────────────────────────────────
# Frontend is built AFTER backend deploy (step 10) so NEXT_PUBLIC_BACKEND_URL
# can be passed as a --build-arg and baked into the Next.js bundle correctly.

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> Building backend image (linux/amd64 for Cloud Run)..."
docker build --platform linux/amd64 -t "${BACKEND_IMAGE}" "${REPO_ROOT}/backend"
docker push "${BACKEND_IMAGE}"

# ─── 7. Resolve Cloud Run service account ────────────────────────────────────
# Default compute SA is used unless a custom SA is specified.
# Resolve the project number once to construct the SA email.

PROJECT_NUMBER="$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')"
DEFAULT_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

# ─── 8. Grant IAM roles BEFORE deploy ────────────────────────────────────────
# Grant roles before deploying so the SA is ready when Cloud Run cold-starts
# (min-instances=1 means the first instance starts immediately after deploy).

echo "==> Granting IAM roles to Cloud Run SA: ${DEFAULT_SA}..."

# Cloud SQL client — required for unix socket connections
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${DEFAULT_SA}" \
  --role="roles/cloudsql.client" --quiet 2>/dev/null || true

# Vertex AI user — required for Gemini model calls (gemini-3-flash-preview)
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${DEFAULT_SA}" \
  --role="roles/aiplatform.user" --quiet 2>/dev/null || true

# Secret Manager — db password (always present)
gcloud secrets add-iam-policy-binding aegis-db-pass \
  --member="serviceAccount:${DEFAULT_SA}" \
  --role="roles/secretmanager.secretAccessor" \
  --project="${PROJECT_ID}" --quiet 2>/dev/null || true

# Secret Manager — Linear key (only if the secret was created)
if [[ "${LINEAR_SECRET_EXISTS}" == "true" ]]; then
  gcloud secrets add-iam-policy-binding aegis-linear-key \
    --member="serviceAccount:${DEFAULT_SA}" \
    --role="roles/secretmanager.secretAccessor" \
    --project="${PROJECT_ID}" --quiet 2>/dev/null || true
fi

# Secret Manager — Jules key (only if the secret was created)
if [[ "${JULES_SECRET_EXISTS}" == "true" ]]; then
  gcloud secrets add-iam-policy-binding aegis-jules-key \
    --member="serviceAccount:${DEFAULT_SA}" \
    --role="roles/secretmanager.secretAccessor" \
    --project="${PROJECT_ID}" --quiet 2>/dev/null || true
fi

# GCS artifact bucket — required for GcsArtifactService
gcloud storage buckets add-iam-policy-binding "gs://${ARTIFACT_BUCKET}" \
  --member="serviceAccount:${DEFAULT_SA}" \
  --role="roles/storage.objectAdmin" \
  --quiet 2>/dev/null || true

echo "    IAM propagation takes ~30s — sleeping before deploy..."
sleep 30

# ─── 9. Deploy backend ───────────────────────────────────────────────────────

echo "==> Deploying backend Cloud Run service..."

# Build the --set-secrets flag — must be a SINGLE flag with comma-separated
# key=secret:version pairs (multiple --set-secrets flags override each other).
SECRET_PAIRS=""
if [[ "${LINEAR_SECRET_EXISTS}" == "true" ]]; then
  SECRET_PAIRS="LINEAR_API_KEY=aegis-linear-key:latest"
fi
if [[ "${JULES_SECRET_EXISTS}" == "true" ]]; then
  SECRET_PAIRS="${SECRET_PAIRS:+${SECRET_PAIRS},}JULES_API_KEY=aegis-jules-key:latest"
fi
SECRET_FLAGS=""
if [[ -n "${SECRET_PAIRS}" ]]; then
  SECRET_FLAGS="--set-secrets=${SECRET_PAIRS}"
fi

gcloud run deploy "${BACKEND_SERVICE}" \
  --image="${BACKEND_IMAGE}" \
  --region="${REGION}" \
  --project="${PROJECT_ID}" \
  --platform=managed \
  --allow-unauthenticated \
  --memory=2Gi \
  --cpu=1 \
  --min-instances=1 \
  --max-instances=10 \
  --timeout=3600 \
  --add-cloudsql-instances="${SQL_CONNECTION_NAME}" \
  --set-env-vars="\
GOOGLE_CLOUD_PROJECT=${PROJECT_ID},\
GOOGLE_CLOUD_LOCATION=global,\
GOOGLE_GENAI_USE_VERTEXAI=true,\
DATABASE_URL=${DATABASE_URL},\
AEGIS_SESSION_DB=${DATABASE_URL},\
AEGIS_MOCK_LINEAR=${MOCK_LINEAR},\
ARTIFACT_BUCKET=${ARTIFACT_BUCKET},\
ALLOWED_ORIGINS=*" \
  ${SECRET_FLAGS} \
  --quiet

BACKEND_URL="$(gcloud run services describe "${BACKEND_SERVICE}" \
  --region="${REGION}" --project="${PROJECT_ID}" \
  --format='value(status.url)')"
echo "    Backend: ${BACKEND_URL}"

# ─── 10. Run Alembic migrations ───────────────────────────────────────────────
# Must run before first traffic hits the backend. Uses a one-off Cloud Run Job
# so no local Cloud SQL Proxy is required. The job reuses the backend image
# (which already has alembic + app code) and connects via unix socket.

echo "==> Running Alembic migrations via Cloud Run Job..."
gcloud run jobs create aegis-migrate \
  --image="${BACKEND_IMAGE}" \
  --region="${REGION}" \
  --project="${PROJECT_ID}" \
  --add-cloudsql-instances="${SQL_CONNECTION_NAME}" \
  --set-env-vars="\
DATABASE_URL=${DATABASE_URL},\
GOOGLE_CLOUD_PROJECT=${PROJECT_ID},\
GOOGLE_CLOUD_LOCATION=global" \
  --command="uv" \
  --args="run,alembic,upgrade,head" \
  --quiet 2>/dev/null || \
  gcloud run jobs update aegis-migrate \
    --image="${BACKEND_IMAGE}" \
    --region="${REGION}" \
    --project="${PROJECT_ID}" \
    --add-cloudsql-instances="${SQL_CONNECTION_NAME}" \
    --set-env-vars="\
DATABASE_URL=${DATABASE_URL},\
GOOGLE_CLOUD_PROJECT=${PROJECT_ID},\
GOOGLE_CLOUD_LOCATION=global" \
    --command="uv" \
    --args="run,alembic,upgrade,head" \
    --quiet

gcloud run jobs execute aegis-migrate \
  --region="${REGION}" \
  --project="${PROJECT_ID}" \
  --wait \
  --quiet
echo "    Migrations complete."

# ─── 11. Build & push frontend image (after backend URL is known) ─────────────
# NEXT_PUBLIC_BACKEND_URL must be baked into the Next.js bundle at build time.
# We build the image here, after the backend URL is resolved.

echo "==> Building frontend image (linux/amd64, with NEXT_PUBLIC_BACKEND_URL baked in)..."
docker build \
  --platform linux/amd64 \
  --build-arg NEXT_PUBLIC_BACKEND_URL="${BACKEND_URL}" \
  -t "${FRONTEND_IMAGE}" \
  "${REPO_ROOT}/frontend"
docker push "${FRONTEND_IMAGE}"

# ─── 12. Deploy frontend ──────────────────────────────────────────────────────

echo "==> Deploying frontend Cloud Run service..."
gcloud run deploy "${FRONTEND_SERVICE}" \
  --image="${FRONTEND_IMAGE}" \
  --region="${REGION}" \
  --project="${PROJECT_ID}" \
  --platform=managed \
  --allow-unauthenticated \
  --memory=512Mi \
  --cpu=1 \
  --min-instances=0 \
  --max-instances=5 \
  --set-env-vars="BACKEND_URL=${BACKEND_URL}/adk/v1/app" \
  --quiet

FRONTEND_URL="$(gcloud run services describe "${FRONTEND_SERVICE}" \
  --region="${REGION}" --project="${PROJECT_ID}" \
  --format='value(status.url)')"

# ─── Done ─────────────────────────────────────────────────────────────────────

echo ""
echo "✓ Deployment complete"
echo "  Backend:  ${BACKEND_URL}"
echo "  Frontend: ${FRONTEND_URL}"
echo ""
echo "Next steps:"
echo "  1. Lock down CORS to frontend URL (recommended):"
echo "     gcloud run services update ${BACKEND_SERVICE} --region=${REGION} \\"
echo "       --update-env-vars=ALLOWED_ORIGINS=${FRONTEND_URL}"
echo ""
echo "  3. Upgrade DB tier when scaling:"
echo "     gcloud sql instances patch ${SQL_INSTANCE} --tier=db-custom-2-7680"
echo "     # To migrate to AlloyDB later: set DATABASE_URL to AlloyDB unix socket path"
