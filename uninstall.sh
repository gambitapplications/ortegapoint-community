#!/usr/bin/env bash
set -euo pipefail

LABEL="com.ortegapoint-community.app"
SERVICE_NAME="ortegapoint-community.service"
APP_ROOT="${HOME}/.ortegapoint-community"
APP_DIR="${APP_ROOT}/app"
META_FILE="${APP_ROOT}/install-meta.env"
LOG_FILE="/tmp/ortegapoint-community.log"
OS=""
MODE=""
STORAGE_ROOT=""
DATA_DIR=""
PUBLIC_DOMAIN=""

prompt_yes_no() {
  local label="$1"
  local default_choice="${2:-N}"
  local reply=""
  local prompt="[y/N]"
  if [[ "${default_choice}" == "Y" ]]; then
    prompt="[Y/n]"
  fi

  while true; do
    read -r -p "${label} ${prompt}: " reply
    reply="${reply:-$default_choice}"
    case "${reply}" in
      y|Y) return 0 ;;
      n|N) return 1 ;;
      *) echo "Please answer y or n." ;;
    esac
  done
}

detect_os() {
  case "$(uname -s)" in
    Darwin) OS="macos" ;;
    Linux) OS="linux" ;;
    *) echo "Unsupported OS: $(uname -s)" >&2; exit 1 ;;
  esac
}

load_metadata() {
  if [[ -f "${META_FILE}" ]]; then
    # shellcheck disable=SC1090
    source "${META_FILE}"
  fi

  if [[ -f "${APP_DIR}/.env" ]]; then
    STORAGE_ROOT="${STORAGE_ROOT:-$(awk -F= '/^ORTEGA_STORAGE_ROOT=/{print substr($0, index($0,$2))}' "${APP_DIR}/.env" | tail -1)}"
    DATA_DIR="${DATA_DIR:-$(awk -F= '/^ORTEGA_DATA_DIR=/{print substr($0, index($0,$2))}' "${APP_DIR}/.env" | tail -1)}"
  fi

  STORAGE_ROOT="${STORAGE_ROOT:-${HOME}/OrtegaPointCommunity}"
  DATA_DIR="${DATA_DIR:-${HOME}/.ortegapoint-community/data}"
  MODE="${MODE:-}"
  PUBLIC_DOMAIN="${PUBLIC_DOMAIN:-}"
}

uninstall_launchd() {
  local plist_path="${HOME}/Library/LaunchAgents/${LABEL}.plist"
  launchctl bootout "gui/$(id -u)" "${plist_path}" >/dev/null 2>&1 || true
  rm -f "${plist_path}"
}

uninstall_systemd() {
  local unit_path="${HOME}/.config/systemd/user/${SERVICE_NAME}"
  systemctl --user disable --now "${SERVICE_NAME}" >/dev/null 2>&1 || true
  rm -f "${unit_path}"
  systemctl --user daemon-reload >/dev/null 2>&1 || true
}

remove_cloudflare_tunnel() {
  if [[ "${MODE}" != "cloudflare" ]]; then
    return
  fi

  if ! prompt_yes_no "Remove the cloudflared tunnel named 'ortegapoint-community' too?" "N"; then
    return
  fi

  if ! command -v cloudflared >/dev/null 2>&1; then
    echo "cloudflared not found; skipping tunnel removal." >&2
    return
  fi

  cloudflared tunnel delete ortegapoint-community || {
    echo "Tunnel deletion failed. You may need to remove it manually in Cloudflare." >&2
  }

  if [[ -n "${PUBLIC_DOMAIN}" ]]; then
    echo "If DNS for ${PUBLIC_DOMAIN} still exists, remove it in Cloudflare DNS." >&2
  fi
}

remove_dirs() {
  if prompt_yes_no "Delete app data dir (${DATA_DIR})?" "N"; then
    rm -rf "${DATA_DIR}"
  fi

  if prompt_yes_no "Delete storage root (${STORAGE_ROOT})?" "N"; then
    rm -rf "${STORAGE_ROOT}"
  fi

  rm -rf "${APP_DIR}"
  rm -f "${META_FILE}"

  if [[ -d "${APP_ROOT}" ]] && [[ -z "$(find "${APP_ROOT}" -mindepth 1 -maxdepth 1 2>/dev/null)" ]]; then
    rmdir "${APP_ROOT}" || true
  fi
}

main() {
  detect_os
  load_metadata

  if [[ "${OS}" == "macos" ]]; then
    uninstall_launchd
  else
    uninstall_systemd
  fi

  remove_cloudflare_tunnel
  remove_dirs

  echo "Ortega Point Community removed."
  echo "Log file, if present: ${LOG_FILE}"
}

main "$@"
