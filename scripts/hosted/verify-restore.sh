#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/common.sh"

usage() {
  cat <<'EOF'
Usage: scripts/hosted/verify-restore.sh --instance-root DIR [options]

Starts oar-core against the restored workspace on a loopback port, verifies
/health, and checks restored metadata counts against the source manifest.

Options:
  --manifest PATH        Manifest to compare against
  --receipt PATH         Restore receipt to compare against
  --core-bin PATH        oar-core binary to use
  --schema-path PATH     Schema path to use
  --listen-port PORT     Explicit loopback verification port
  --timeout SECONDS      Health wait timeout (default: 20)
EOF
}

INSTANCE_ROOT=""
MANIFEST_PATH=""
RECEIPT_PATH=""
CORE_BIN=""
SCHEMA_PATH=""
LISTEN_PORT=""
TIMEOUT_SECONDS="20"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --instance-root) INSTANCE_ROOT="$2"; shift 2 ;;
    --manifest) MANIFEST_PATH="$2"; shift 2 ;;
    --receipt) RECEIPT_PATH="$2"; shift 2 ;;
    --core-bin) CORE_BIN="$2"; shift 2 ;;
    --schema-path) SCHEMA_PATH="$2"; shift 2 ;;
    --listen-port) LISTEN_PORT="$2"; shift 2 ;;
    --timeout) TIMEOUT_SECONDS="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *)
      usage >&2
      die "unknown option: $1"
      ;;
  esac
done

[[ -n "$INSTANCE_ROOT" ]] || die "--instance-root is required"
require_command sqlite3 curl

INSTANCE_ROOT="$(cd "$INSTANCE_ROOT" && pwd -P)"
WORKSPACE_ROOT="${INSTANCE_ROOT}/workspace"
ENV_FILE="${INSTANCE_ROOT}/config/env.production"
INSTANCE_METADATA_FILE="${INSTANCE_ROOT}/metadata/instance.env"
if [[ -z "$MANIFEST_PATH" ]]; then
  MANIFEST_PATH="${INSTANCE_ROOT}/metadata/restore-source-manifest.env"
fi
if [[ -z "$RECEIPT_PATH" ]]; then
  RECEIPT_PATH="${INSTANCE_ROOT}/metadata/restore-receipt.env"
fi
[[ -f "$MANIFEST_PATH" ]] || die "manifest not found: $MANIFEST_PATH"
[[ -f "$INSTANCE_METADATA_FILE" ]] || die "instance metadata not found: $INSTANCE_METADATA_FILE"
[[ -f "${WORKSPACE_ROOT}/state.sqlite" ]] || die "restored sqlite database not found: ${WORKSPACE_ROOT}/state.sqlite"

if [[ -z "$CORE_BIN" ]]; then
  CORE_BIN="$(resolve_core_bin)"
fi
if [[ -z "$SCHEMA_PATH" ]]; then
  SCHEMA_PATH="$(resolve_schema_path)"
fi
if [[ -z "$LISTEN_PORT" ]]; then
  LISTEN_PORT="$(pick_loopback_port)"
fi
validate_port "$LISTEN_PORT"

unset OAR_BOOTSTRAP_TOKEN
load_dotenv_file "$ENV_FILE"
EXPECTED_ARTIFACT_COUNT="$(manifest_get "$MANIFEST_PATH" ARTIFACT_COUNT)"
EXPECTED_AGENT_COUNT="$(manifest_get "$MANIFEST_PATH" AGENT_COUNT)"
EXPECTED_INVITE_COUNT="$(manifest_get "$MANIFEST_PATH" INVITE_COUNT)"
EXPECTED_BLOB_FILE_COUNT="$(manifest_get "$MANIFEST_PATH" BLOB_FILE_COUNT)"
EXPECTED_CORE_INSTANCE_ID="$(manifest_get "$MANIFEST_PATH" CORE_INSTANCE_ID || true)"
EXPECTED_BOOTSTRAP_STATE="$(manifest_get "$MANIFEST_PATH" BOOTSTRAP_STATE || true)"
SOURCE_INSTANCE_ROOT="$(manifest_get "$MANIFEST_PATH" SOURCE_INSTANCE_ROOT || true)"
SOURCE_WORKSPACE_ROOT="$(manifest_get "$MANIFEST_PATH" SOURCE_WORKSPACE_ROOT || true)"
SOURCE_PUBLIC_ORIGIN="$(manifest_get "$MANIFEST_PATH" PUBLIC_ORIGIN || true)"
TARGET_CORE_INSTANCE_ID="$(dotenv_get "$ENV_FILE" OAR_CORE_INSTANCE_ID || true)"
TARGET_WORKSPACE_ROOT="$(dotenv_get "$ENV_FILE" HOST_OAR_WORKSPACE_ROOT || true)"
TARGET_WEB_UI_ORIGIN="$(dotenv_get "$ENV_FILE" OAR_WEB_UI_ORIGIN || true)"
TARGET_WEBAUTHN_ORIGIN="$(dotenv_get "$ENV_FILE" OAR_WEBAUTHN_ORIGIN || true)"
METADATA_INSTANCE_ROOT="$(dotenv_get "$INSTANCE_METADATA_FILE" INSTANCE_ROOT || true)"
METADATA_WORKSPACE_ROOT="$(dotenv_get "$INSTANCE_METADATA_FILE" WORKSPACE_ROOT || true)"
METADATA_BACKUPS_DIR="$(dotenv_get "$INSTANCE_METADATA_FILE" BACKUPS_DIR || true)"
METADATA_PUBLIC_ORIGIN="$(dotenv_get "$INSTANCE_METADATA_FILE" PUBLIC_ORIGIN || true)"
METADATA_CORE_INSTANCE_ID="$(dotenv_get "$INSTANCE_METADATA_FILE" CORE_INSTANCE_ID || true)"
EXPECTED_TARGET_WORKSPACE_ROOT="${INSTANCE_ROOT}/workspace"
EXPECTED_TARGET_BACKUPS_DIR="${INSTANCE_ROOT}/backups"
EXPECTED_ACTIVE_BOOTSTRAP_STATE=""
RESTORE_BOOTSTRAP_TOKEN_MODE=""
if [[ -f "$RECEIPT_PATH" ]]; then
  EXPECTED_ACTIVE_BOOTSTRAP_STATE="$(dotenv_get "$RECEIPT_PATH" EXPECTED_ACTIVE_BOOTSTRAP_STATE || true)"
  RESTORE_BOOTSTRAP_TOKEN_MODE="$(dotenv_get "$RECEIPT_PATH" BOOTSTRAP_TOKEN_MODE || true)"
fi

SERVER_LOG_DIR="${WORKSPACE_ROOT}/logs"
SERVER_LOG_FILE="${SERVER_LOG_DIR}/restore-verify.log"
mkdir -p "$SERVER_LOG_DIR"

cleanup() {
  if [[ -n "${SERVER_PID:-}" ]]; then
    kill "${SERVER_PID}" >/dev/null 2>&1 || true
    wait "${SERVER_PID}" 2>/dev/null || true
  fi
}
trap cleanup EXIT

OAR_ENABLE_DEV_ACTOR_MODE=false \
OAR_ALLOW_UNAUTHENTICATED_WRITES=false \
OAR_BOOTSTRAP_TOKEN="${OAR_BOOTSTRAP_TOKEN:-}" \
"$CORE_BIN" \
  --listen-addr "127.0.0.1:${LISTEN_PORT}" \
  --schema-path "$SCHEMA_PATH" \
  --workspace-root "$WORKSPACE_ROOT" \
  --core-instance-id "${TARGET_CORE_INSTANCE_ID:-${EXPECTED_CORE_INSTANCE_ID:-restore-verify}}" \
  >"$SERVER_LOG_FILE" 2>&1 &
SERVER_PID="$!"

if ! wait_for_http_ok "http://127.0.0.1:${LISTEN_PORT}/health" "$TIMEOUT_SECONDS"; then
  die "restore verification could not reach /health on 127.0.0.1:${LISTEN_PORT}; see ${SERVER_LOG_FILE}"
fi

ACTUAL_ARTIFACT_COUNT="$(sqlite_scalar "${WORKSPACE_ROOT}/state.sqlite" "SELECT COUNT(*) FROM artifacts;")"
ACTUAL_AGENT_COUNT="$(sqlite_scalar "${WORKSPACE_ROOT}/state.sqlite" "SELECT COUNT(*) FROM agents;")"
ACTUAL_INVITE_COUNT="$(sqlite_scalar "${WORKSPACE_ROOT}/state.sqlite" "SELECT COUNT(*) FROM auth_invites;")"
ACTUAL_BLOB_FILE_COUNT="$(count_files "${WORKSPACE_ROOT}/artifacts/content")"
ACTUAL_BOOTSTRAP_STATE="disabled"
if [[ -n "${OAR_BOOTSTRAP_TOKEN:-}" && "${OAR_BOOTSTRAP_TOKEN}" != "$HOSTED_BOOTSTRAP_PLACEHOLDER" ]]; then
  ACTUAL_BOOTSTRAP_STATE="available"
  BOOTSTRAP_CONSUMED_AT="$(sqlite_scalar "${WORKSPACE_ROOT}/state.sqlite" "SELECT COALESCE(consumed_at, '') FROM auth_bootstrap_state WHERE id = 1;")"
  if [[ -n "$BOOTSTRAP_CONSUMED_AT" ]]; then
    ACTUAL_BOOTSTRAP_STATE="consumed"
  fi
fi

[[ "$ACTUAL_ARTIFACT_COUNT" == "$EXPECTED_ARTIFACT_COUNT" ]] || die "artifact count mismatch: expected ${EXPECTED_ARTIFACT_COUNT}, got ${ACTUAL_ARTIFACT_COUNT}"
[[ "$ACTUAL_AGENT_COUNT" == "$EXPECTED_AGENT_COUNT" ]] || die "agent count mismatch: expected ${EXPECTED_AGENT_COUNT}, got ${ACTUAL_AGENT_COUNT}"
[[ "$ACTUAL_INVITE_COUNT" == "$EXPECTED_INVITE_COUNT" ]] || die "invite count mismatch: expected ${EXPECTED_INVITE_COUNT}, got ${ACTUAL_INVITE_COUNT}"
[[ "$ACTUAL_BLOB_FILE_COUNT" == "$EXPECTED_BLOB_FILE_COUNT" ]] || die "blob file count mismatch: expected ${EXPECTED_BLOB_FILE_COUNT}, got ${ACTUAL_BLOB_FILE_COUNT}"
[[ "$TARGET_WORKSPACE_ROOT" == "$EXPECTED_TARGET_WORKSPACE_ROOT" ]] || die "active env workspace root mismatch: expected ${EXPECTED_TARGET_WORKSPACE_ROOT}, got ${TARGET_WORKSPACE_ROOT:-<unset>}"
[[ "$METADATA_INSTANCE_ROOT" == "$INSTANCE_ROOT" ]] || die "active metadata instance root mismatch: expected ${INSTANCE_ROOT}, got ${METADATA_INSTANCE_ROOT:-<unset>}"
[[ "$METADATA_WORKSPACE_ROOT" == "$EXPECTED_TARGET_WORKSPACE_ROOT" ]] || die "active metadata workspace root mismatch: expected ${EXPECTED_TARGET_WORKSPACE_ROOT}, got ${METADATA_WORKSPACE_ROOT:-<unset>}"
[[ "$METADATA_BACKUPS_DIR" == "$EXPECTED_TARGET_BACKUPS_DIR" ]] || die "active metadata backups dir mismatch: expected ${EXPECTED_TARGET_BACKUPS_DIR}, got ${METADATA_BACKUPS_DIR:-<unset>}"
[[ "$TARGET_WEB_UI_ORIGIN" == "$TARGET_WEBAUTHN_ORIGIN" ]] || die "active env origin mismatch: web ui origin=${TARGET_WEB_UI_ORIGIN:-<unset>} webauthn origin=${TARGET_WEBAUTHN_ORIGIN:-<unset>}"
[[ "$TARGET_WEB_UI_ORIGIN" == "$METADATA_PUBLIC_ORIGIN" ]] || die "active metadata/public origin mismatch: env=${TARGET_WEB_UI_ORIGIN:-<unset>} metadata=${METADATA_PUBLIC_ORIGIN:-<unset>}"
[[ "$TARGET_CORE_INSTANCE_ID" == "$METADATA_CORE_INSTANCE_ID" ]] || die "active metadata/core instance id mismatch: env=${TARGET_CORE_INSTANCE_ID:-<unset>} metadata=${METADATA_CORE_INSTANCE_ID:-<unset>}"
if [[ -n "$SOURCE_INSTANCE_ROOT" && "$SOURCE_INSTANCE_ROOT" != "$INSTANCE_ROOT" ]]; then
  [[ "$METADATA_INSTANCE_ROOT" != "$SOURCE_INSTANCE_ROOT" ]] || die "active metadata leaked source instance root"
  [[ "$METADATA_BACKUPS_DIR" != "${SOURCE_INSTANCE_ROOT}/backups" ]] || die "active metadata leaked source backups dir"
fi
if [[ -n "$SOURCE_WORKSPACE_ROOT" && "$SOURCE_WORKSPACE_ROOT" != "$EXPECTED_TARGET_WORKSPACE_ROOT" ]]; then
  [[ "$TARGET_WORKSPACE_ROOT" != "$SOURCE_WORKSPACE_ROOT" ]] || die "active env leaked source workspace root"
  [[ "$METADATA_WORKSPACE_ROOT" != "$SOURCE_WORKSPACE_ROOT" ]] || die "active metadata leaked source workspace root"
fi
if [[ -n "$SOURCE_PUBLIC_ORIGIN" && "$SOURCE_PUBLIC_ORIGIN" != "$TARGET_WEB_UI_ORIGIN" ]]; then
  [[ "$TARGET_WEB_UI_ORIGIN" != "$SOURCE_PUBLIC_ORIGIN" ]] || die "active env leaked source public origin"
  [[ "$TARGET_WEBAUTHN_ORIGIN" != "$SOURCE_PUBLIC_ORIGIN" ]] || die "active env leaked source webauthn origin"
  [[ "$METADATA_PUBLIC_ORIGIN" != "$SOURCE_PUBLIC_ORIGIN" ]] || die "active metadata leaked source public origin"
fi
if [[ -n "$EXPECTED_ACTIVE_BOOTSTRAP_STATE" ]]; then
  [[ "$ACTUAL_BOOTSTRAP_STATE" == "$EXPECTED_ACTIVE_BOOTSTRAP_STATE" ]] || die "bootstrap state mismatch: expected ${EXPECTED_ACTIVE_BOOTSTRAP_STATE}, got ${ACTUAL_BOOTSTRAP_STATE}"
elif [[ -n "$EXPECTED_BOOTSTRAP_STATE" ]]; then
  [[ "$ACTUAL_BOOTSTRAP_STATE" == "$EXPECTED_BOOTSTRAP_STATE" ]] || die "bootstrap state mismatch: expected ${EXPECTED_BOOTSTRAP_STATE}, got ${ACTUAL_BOOTSTRAP_STATE}"
fi
if [[ -f "$RECEIPT_PATH" ]]; then
  RECEIPT_CORE_INSTANCE_ID="$(dotenv_get "$RECEIPT_PATH" TARGET_CORE_INSTANCE_ID || true)"
  if [[ -n "$RECEIPT_CORE_INSTANCE_ID" && "$RECEIPT_CORE_INSTANCE_ID" != "$TARGET_CORE_INSTANCE_ID" ]]; then
    die "core instance id mismatch: receipt=${RECEIPT_CORE_INSTANCE_ID} env=${TARGET_CORE_INSTANCE_ID}"
  fi
elif [[ -n "$EXPECTED_CORE_INSTANCE_ID" && -n "$TARGET_CORE_INSTANCE_ID" && "$EXPECTED_CORE_INSTANCE_ID" != "$TARGET_CORE_INSTANCE_ID" ]]; then
  die "core instance id mismatch: manifest=${EXPECTED_CORE_INSTANCE_ID} env=${TARGET_CORE_INSTANCE_ID}"
fi

log "Restore verification succeeded for ${INSTANCE_ROOT}"
log "  /health:                 ok"
log "  artifact count:          ${ACTUAL_ARTIFACT_COUNT}"
log "  agent count:             ${ACTUAL_AGENT_COUNT}"
log "  invite count:            ${ACTUAL_INVITE_COUNT}"
log "  blob file count:         ${ACTUAL_BLOB_FILE_COUNT}"
if [[ -n "$RESTORE_BOOTSTRAP_TOKEN_MODE" ]]; then
  log "  bootstrap mode:          ${RESTORE_BOOTSTRAP_TOKEN_MODE}"
fi
log "  bootstrap state:         ${ACTUAL_BOOTSTRAP_STATE}"
