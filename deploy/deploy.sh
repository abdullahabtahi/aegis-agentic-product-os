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

echo "==> Project: ${PROJECT_ID}  Region: ${REGION}"

# ─── 1. Enable APIs ───────────────────────────────────────────────────────────

echo "==> Enabling required GCP APIs..."
gcloud services enable \
  sqladmin.googleapis.com \
  artifactregistry.googleapis.com \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  secretmanager.googleapis.com \
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

if [[ -n "${LINEAR_API_KEY}" ]]; then
  echo -n "${LINEAR_API_KEY}" | gcloud secrets create aegis-linear-key \
    --data-file=- --project="${PROJECT_ID}" --quiet 2>/dev/null || \
    echo -n "${LINEAR_API_KEY}" | gcloud secrets versions add aegis-linear-key \
      --data-file=- --project="${PROJECT_ID}" --quiet
fi

# ─── 6. Build & push images ──────────────────────────────────────────────────

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> Building backend image..."
docker build -t "${BACKEND_IMAGE}" "${REPO_ROOT}/backend"
docker push "${BACKEND_IMAGE}"

echo "==> Building frontend image..."
docker build -t "${FRONTEND_IMAGE}" "${REPO_ROOT}/frontend"
docker push "${FRONTEND_IMAGE}"

# ─── 7. Deploy backend ───────────────────────────────────────────────────────

echo "==> Deploying backend Cloud Run service..."
gcloud run deploy "${BACKEND_SERVICE}" \
  --image="${BACKEND_IMAGE}" \
  --region="${REGION}" \
  --project="${PROJECT_ID}" \
  --platform=managed \
  --allow-unauthenticated \
  --memory=1Gi \
  --cpu=1 \
  --min-instances=1 \
  --max-instances=10 \
  --add-cloudsql-instances="${SQL_CONNECTION_NAME}" \
  --set-env-vars="\
GOOGLE_CLOUD_PROJECT=${PROJECT_ID},\
GOOGLE_CLOUD_LOCATION=global,\
DATABASE_URL=${DATABASE_URL},\
AEGIS_SESSION_DB=${DATABASE_URL},\
AEGIS_MOCK_LINEAR=false,\
ALLOWED_ORIGINS=*" \
  --set-secrets="LINEAR_API_KEY=aegis-linear-key:latest" \
  --quiet

BACKEND_URL="$(gcloud run services describe "${BACKEND_SERVICE}" \
  --region="${REGION}" --project="${PROJECT_ID}" \
  --format='value(status.url)')"
echo "    Backend: ${BACKEND_URL}"

# ─── 8. Grant Cloud Run SA access to Cloud SQL + secrets ─────────────────────

CR_SA="$(gcloud run services describe "${BACKEND_SERVICE}" \
  --region="${REGION}" --project="${PROJECT_ID}" \
  --format='value(spec.template.spec.serviceAccountName)')"
CR_SA="${CR_SA:-$(gcloud projects describe "${PROJECT_ID}" \
  --format='value(projectNumber)')}-compute@developer.gserviceaccount.com"

echo "==> Granting IAM roles to Cloud Run SA: ${CR_SA}..."
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${CR_SA}" \
  --role="roles/cloudsql.client" --quiet 2>/dev/null || true

for SECRET in aegis-db-pass aegis-linear-key; do
  gcloud secrets add-iam-policy-binding "${SECRET}" \
    --member="serviceAccount:${CR_SA}" \
    --role="roles/secretmanager.secretAccessor" \
    --project="${PROJECT_ID}" --quiet 2>/dev/null || true
done

# ─── 9. Deploy frontend ───────────────────────────────────────────────────────

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
  --set-env-vars="NEXT_PUBLIC_BACKEND_URL=${BACKEND_URL},BACKEND_URL=${BACKEND_URL}/adk/v1/app" \
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
echo "  1. Run Alembic migrations against Cloud SQL:"
echo "     cd backend"
echo "     DATABASE_URL='postgresql+psycopg2://${DB_USER}:${DB_PASS}@127.0.0.1:5433/${DB_NAME}' \\"
echo "       CLOUDSDK_PYTHON=python3 cloud_sql_proxy -instances=${SQL_CONNECTION_NAME}=tcp:5433 &"
echo "     uv run alembic upgrade head"
echo ""
echo "  2. Lock down CORS to frontend URL:"
echo "     gcloud run services update ${BACKEND_SERVICE} --region=${REGION} \\"
echo "       --update-env-vars=ALLOWED_ORIGINS=${FRONTEND_URL}"
echo ""
echo "  3. Upgrade DB tier when scaling:"
echo "     gcloud sql instances patch ${SQL_INSTANCE} --tier=db-custom-2-7680"
echo "     # To migrate to AlloyDB later: same schema, set ALLOYDB_INSTANCE_URI instead of DATABASE_URL"
