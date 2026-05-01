#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# SPOTv2 — Deploy to Google Cloud Run
#
# Prerequisites:
#   - gcloud CLI installed and authenticated  (gcloud auth login)
#   - A GCP project with billing enabled      (gcloud config set project <ID>)
#   - Your account must be a project Owner
#
# Required env vars (set these before running, or export them):
#   SUPABASE_URL                — your Supabase project URL
#   SUPABASE_SERVICE_ROLE_KEY   — Supabase service role key
#
# Optional env vars:
#   TBA_API_KEY, TBA_EVENT_KEY, ACCESS_CODE,
#   GEMINI_API_KEY, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
#
# Usage:
#   export SUPABASE_URL="https://xxx.supabase.co"
#   export SUPABASE_SERVICE_ROLE_KEY="eyJ..."
#   cd deploy/gcp && chmod +x deploy.sh && ./deploy.sh
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# ---------- Pre-flight ----------
command -v gcloud &>/dev/null || { echo "ERROR: gcloud not found. Install Google Cloud SDK."; exit 1; }

PROJECT_ID=$(gcloud config get-value project 2>/dev/null)
[ -z "${PROJECT_ID}" ] || [ "${PROJECT_ID}" = "(unset)" ] && {
  echo "ERROR: No GCP project set. Run: gcloud config set project YOUR_PROJECT_ID"; exit 1; }

[ -z "${SUPABASE_URL:-}" ]                 && { echo "ERROR: SUPABASE_URL not set."; exit 1; }
[ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]    && { echo "ERROR: SUPABASE_SERVICE_ROLE_KEY not set."; exit 1; }

REGION="${GCP_REGION:-us-central1}"
SERVICE_NAME="${CLOUD_RUN_SERVICE:-spotv2}"
IMAGE="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

echo "=== SPOTv2 GCP Deployment ==="
echo "Project: ${PROJECT_ID} | Region: ${REGION} | Service: ${SERVICE_NAME}"
echo ""

trap 'rm -f "${PROJECT_ROOT}/Dockerfile" "${PROJECT_ROOT}/.dockerignore"' EXIT

# ---------- Step 1: Enable APIs ----------
echo ">>> Step 1: Enabling required GCP APIs..."
gcloud services enable \
  run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com --quiet

# ---------- Step 2: Wait for service accounts ----------
echo ">>> Step 2: Waiting for service accounts..."
PROJECT_NUMBER=$(gcloud projects describe "${PROJECT_ID}" --format="value(projectNumber)")
COMPUTE_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
CLOUDBUILD_SA="${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"

for i in $(seq 1 12); do
  gcloud iam service-accounts describe "${COMPUTE_SA}" --project="${PROJECT_ID}" &>/dev/null && break
  [ "$i" -eq 12 ] && { echo "ERROR: Timed out. Is billing linked?"; exit 1; }
  echo "    Waiting... (${i}/12)"; sleep 10
done

# ---------- Step 3: Grant permissions ----------
echo ">>> Step 3: Granting IAM permissions..."
CURRENT_ACCOUNT=$(gcloud config get-value account 2>/dev/null)

for role in roles/cloudbuild.builds.editor roles/run.admin roles/iam.serviceAccountUser; do
  gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member="user:${CURRENT_ACCOUNT}" --role="${role}" --quiet >/dev/null
done
for role in roles/artifactregistry.admin roles/logging.logWriter; do
  gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member="serviceAccount:${COMPUTE_SA}" --role="${role}" --quiet >/dev/null
done
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${CLOUDBUILD_SA}" --role="roles/artifactregistry.writer" --quiet >/dev/null

echo "    Permissions granted. Waiting 30s for IAM propagation..."
sleep 30

# ---------- Step 4: Artifact Registry ----------
echo ">>> Step 4: Setting up Artifact Registry..."
if ! gcloud artifacts repositories describe gcr.io --location=us --project="${PROJECT_ID}" &>/dev/null; then
  gcloud artifacts repositories create gcr.io \
    --repository-format=docker --location=us --project="${PROJECT_ID}" --quiet
fi

# ---------- Step 5: Build container ----------
echo ">>> Step 5: Building container image..."
cp "${SCRIPT_DIR}/Dockerfile"    "${PROJECT_ROOT}/Dockerfile"
cp "${SCRIPT_DIR}/.dockerignore" "${PROJECT_ROOT}/.dockerignore"
cd "${PROJECT_ROOT}"
gcloud builds submit --tag "${IMAGE}" --quiet

# ---------- Step 6: Deploy to Cloud Run ----------
echo ">>> Step 6: Deploying to Cloud Run..."

# Build the env-var string — only include vars that are set
ENV_VARS="SUPABASE_URL=${SUPABASE_URL},SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}"
[ -n "${TBA_API_KEY:-}" ]            && ENV_VARS="${ENV_VARS},TBA_API_KEY=${TBA_API_KEY}"
[ -n "${TBA_EVENT_KEY:-}" ]          && ENV_VARS="${ENV_VARS},TBA_EVENT_KEY=${TBA_EVENT_KEY}"
[ -n "${ACCESS_CODE:-}" ]            && ENV_VARS="${ENV_VARS},ACCESS_CODE=${ACCESS_CODE}"
[ -n "${GEMINI_API_KEY:-}" ]         && ENV_VARS="${ENV_VARS},GEMINI_API_KEY=${GEMINI_API_KEY}"
[ -n "${GOOGLE_CLIENT_ID:-}" ]       && ENV_VARS="${ENV_VARS},GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}"
[ -n "${GOOGLE_CLIENT_SECRET:-}" ]   && ENV_VARS="${ENV_VARS},GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET}"

gcloud run deploy "${SERVICE_NAME}" \
  --image "${IMAGE}" \
  --region "${REGION}" \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --session-affinity \
  --min-instances 0 \
  --max-instances 1 \
  --memory 512Mi \
  --cpu 1 \
  --timeout 300 \
  --execution-environment gen2 \
  --service-account "${COMPUTE_SA}" \
  --set-env-vars "${ENV_VARS}" \
  --quiet

# ---------- Done ----------
SERVICE_URL=$(gcloud run services describe "${SERVICE_NAME}" \
  --region "${REGION}" --format="value(status.url)")

echo ""
echo "=== Deployment complete! ==="
echo "SPOTv2 is live at: ${SERVICE_URL}"
echo ""
echo "After deploy you can update individual env vars without rebuilding:"
echo "  gcloud run services update ${SERVICE_NAME} --region ${REGION} \\"
echo "    --set-env-vars TBA_EVENT_KEY=2025txhou"
