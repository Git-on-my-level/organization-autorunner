#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: provision-packed-workspace.sh [options]

Create one packed-host workspace root and one systemd env file for
`oar-core@<workspace-id>.service`.

Required:
  --workspace-id ID
  --workspace-slug SLUG
  --workspace-root DIR
  --env-file PATH
  --listen-port PORT
  --public-origin ORIGIN
  --control-plane-workspace-id ID
  --control-plane-base-url URL
  --control-plane-token-issuer ISSUER
  --control-plane-token-audience AUDIENCE
  --control-plane-token-public-key KEY
  --workspace-service-id ID
  --workspace-service-private-key KEY

Optional:
  --blob-backend filesystem|s3   default: filesystem
  --enable                       enable and start systemd unit
  -h, --help                     show help
EOF
}

WORKSPACE_ID=""
WORKSPACE_SLUG=""
WORKSPACE_ROOT=""
ENV_FILE=""
LISTEN_PORT=""
PUBLIC_ORIGIN=""
CONTROL_PLANE_WORKSPACE_ID=""
CONTROL_PLANE_BASE_URL=""
CONTROL_PLANE_TOKEN_ISSUER=""
CONTROL_PLANE_TOKEN_AUDIENCE=""
CONTROL_PLANE_TOKEN_PUBLIC_KEY=""
WORKSPACE_SERVICE_ID=""
WORKSPACE_SERVICE_PRIVATE_KEY=""
BLOB_BACKEND="filesystem"
ENABLE=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --workspace-id) WORKSPACE_ID="$2"; shift 2 ;;
    --workspace-slug) WORKSPACE_SLUG="$2"; shift 2 ;;
    --workspace-root) WORKSPACE_ROOT="$2"; shift 2 ;;
    --env-file) ENV_FILE="$2"; shift 2 ;;
    --listen-port) LISTEN_PORT="$2"; shift 2 ;;
    --public-origin) PUBLIC_ORIGIN="$2"; shift 2 ;;
    --control-plane-workspace-id) CONTROL_PLANE_WORKSPACE_ID="$2"; shift 2 ;;
    --control-plane-base-url) CONTROL_PLANE_BASE_URL="$2"; shift 2 ;;
    --control-plane-token-issuer) CONTROL_PLANE_TOKEN_ISSUER="$2"; shift 2 ;;
    --control-plane-token-audience) CONTROL_PLANE_TOKEN_AUDIENCE="$2"; shift 2 ;;
    --control-plane-token-public-key) CONTROL_PLANE_TOKEN_PUBLIC_KEY="$2"; shift 2 ;;
    --workspace-service-id) WORKSPACE_SERVICE_ID="$2"; shift 2 ;;
    --workspace-service-private-key) WORKSPACE_SERVICE_PRIVATE_KEY="$2"; shift 2 ;;
    --blob-backend) BLOB_BACKEND="$2"; shift 2 ;;
    --enable) ENABLE=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

for value_name in \
  WORKSPACE_ID WORKSPACE_SLUG WORKSPACE_ROOT ENV_FILE LISTEN_PORT PUBLIC_ORIGIN \
  CONTROL_PLANE_WORKSPACE_ID CONTROL_PLANE_BASE_URL CONTROL_PLANE_TOKEN_ISSUER \
  CONTROL_PLANE_TOKEN_AUDIENCE CONTROL_PLANE_TOKEN_PUBLIC_KEY \
  WORKSPACE_SERVICE_ID WORKSPACE_SERVICE_PRIVATE_KEY
do
  if [[ -z "${!value_name}" ]]; then
    echo "Missing required value: ${value_name}" >&2
    exit 1
  fi
done

mkdir -p "${WORKSPACE_ROOT}/artifacts/content" "${WORKSPACE_ROOT}/logs" "${WORKSPACE_ROOT}/tmp"
mkdir -p "$(dirname "${ENV_FILE}")"

cat > "${ENV_FILE}" <<EOF
OAR_LISTEN_ADDR=127.0.0.1:${LISTEN_PORT}
OAR_WORKSPACE_ROOT=${WORKSPACE_ROOT}
OAR_SCHEMA_PATH=/opt/oar/share/oar-schema.yaml
OAR_META_COMMANDS_PATH=/opt/oar/share/meta/commands.json
OAR_CORE_INSTANCE_ID=${WORKSPACE_ID}

OAR_HUMAN_AUTH_MODE=control_plane
OAR_CONTROL_PLANE_BASE_URL=${CONTROL_PLANE_BASE_URL}
OAR_CONTROL_PLANE_HEARTBEAT_INTERVAL=30s
OAR_CONTROL_PLANE_TOKEN_ISSUER=${CONTROL_PLANE_TOKEN_ISSUER}
OAR_CONTROL_PLANE_TOKEN_AUDIENCE=${CONTROL_PLANE_TOKEN_AUDIENCE}
OAR_CONTROL_PLANE_WORKSPACE_ID=${CONTROL_PLANE_WORKSPACE_ID}
OAR_CONTROL_PLANE_TOKEN_PUBLIC_KEY=${CONTROL_PLANE_TOKEN_PUBLIC_KEY}
OAR_WORKSPACE_SERVICE_ID=${WORKSPACE_SERVICE_ID}
OAR_WORKSPACE_SERVICE_PRIVATE_KEY=${WORKSPACE_SERVICE_PRIVATE_KEY}

OAR_ALLOW_UNAUTHENTICATED_WRITES=false
OAR_ENABLE_DEV_ACTOR_MODE=false
OAR_SHUTDOWN_TIMEOUT=15s

OAR_PROJECTION_MODE=background
OAR_PROJECTION_MAINTENANCE_INTERVAL=5s
OAR_PROJECTION_STALE_SCAN_INTERVAL=30s
OAR_PROJECTION_MAINTENANCE_BATCH_SIZE=50

OAR_BLOB_BACKEND=${BLOB_BACKEND}
EOF

chmod 600 "${ENV_FILE}"

echo "Provisioned packed-host workspace:"
echo "  workspace_id:   ${WORKSPACE_ID}"
echo "  workspace_slug: ${WORKSPACE_SLUG}"
echo "  workspace_root: ${WORKSPACE_ROOT}"
echo "  env_file:       ${ENV_FILE}"
echo "  listen_port:    ${LISTEN_PORT}"
echo "  public_origin:  ${PUBLIC_ORIGIN}"

if [[ "${ENABLE}" -eq 1 ]]; then
  systemctl daemon-reload
  systemctl enable --now "oar-core@${WORKSPACE_ID}"
  echo "Started systemd unit: oar-core@${WORKSPACE_ID}"
fi
