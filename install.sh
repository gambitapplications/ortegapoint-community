#!/usr/bin/env bash
set -euo pipefail

LABEL="com.ortegapoint-community.app"
SERVICE_NAME="ortegapoint-community.service"
APP_ROOT="${HOME}/.ortegapoint-community"
APP_DIR="${APP_ROOT}/app"
META_FILE="${APP_ROOT}/install-meta.env"
LOG_FILE="/tmp/ortegapoint-community.log"
FORCE=0

for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    *)
      echo "Unknown argument: $arg" >&2
      exit 2
      ;;
  esac
done

OS=""
OS_VERSION=""
MODE=""
HOST_BIND=""
PUBLIC_URL=""
TAILNET_HOST=""
PUBLIC_DOMAIN=""
CF_TEAM=""
CF_AUD=""
PORT="3000"
STORAGE_ROOT="${HOME}/OrtegaPointCommunity"
DATA_DIR="${HOME}/.ortegapoint-community/data"
MAX_UPLOAD_MB="500"
NODE_BIN=""
USER_NAME="$(id -un)"
TMP_BASE="${TMPDIR:-/tmp}"
WORK_TMP=""
SOURCE_DIR=""
DEFAULT_REPO_URL="${ORTEGA_DEFAULT_REPO_URL:-https://github.com/gambitapplications/ortegapoint-community.git}"
REPO_URL="${ORTEGA_REPO_URL:-${DEFAULT_REPO_URL}}"
if [[ ${#BASH_SOURCE[@]} -gt 0 && -n "${BASH_SOURCE[0]:-}" ]]; then
  SCRIPT_PATH="${BASH_SOURCE[0]}"
else
  SCRIPT_PATH="${0}"
fi
SCRIPT_DIR="$(cd -- "$(dirname -- "${SCRIPT_PATH}")" && pwd)"

cleanup() {
  if [[ -n "${WORK_TMP}" && -d "${WORK_TMP}" ]]; then
    rm -rf "${WORK_TMP}"
  fi
}
trap cleanup EXIT

fail() {
  echo >&2
  echo "ERROR: $*" >&2
  echo "Check ${LOG_FILE} and your service manager for details." >&2
  exit 1
}

on_err() {
  local line="$1"
  echo >&2
  echo "Installation failed near line ${line}." >&2
  echo "Check ${LOG_FILE} and your service manager for details." >&2
}
trap 'on_err $LINENO' ERR

prompt_default() {
  local label="$1"
  local default_value="$2"
  local reply=""
  read -r -p "${label} [${default_value}]: " reply
  if [[ -z "${reply}" ]]; then
    printf '%s\n' "${default_value}"
  else
    printf '%s\n' "${reply}"
  fi
}

prompt_yes_no() {
  local label="$1"
  local default_choice="${2:-Y}"
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
    Darwin)
      OS="macos"
      OS_VERSION="$(sw_vers -productVersion)"
      ;;
    Linux)
      OS="linux"
      if [[ -r /etc/os-release ]]; then
        # shellcheck disable=SC1091
        source /etc/os-release
        OS_VERSION="${PRETTY_NAME:-Linux}"
      else
        OS_VERSION="$(uname -r)"
      fi
      ;;
    *)
      fail "Unsupported OS: $(uname -s). Use macOS or Linux."
      ;;
  esac
}

require_cmd() {
  local cmd="$1"
  local install_hint="$2"
  if ! command -v "${cmd}" >/dev/null 2>&1; then
    echo "Missing required command: ${cmd}" >&2
    echo "Install hint: ${install_hint}" >&2
    exit 1
  fi
}

print_homebrew_help() {
  echo "Homebrew is the recommended package manager for macOS installs." >&2
  echo "Install Homebrew:" >&2
  echo '  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"' >&2
  echo "Verify Homebrew:" >&2
  echo "  brew --version" >&2
}

require_brew() {
  local package_name="$1"
  if command -v brew >/dev/null 2>&1; then
    return
  fi

  print_homebrew_help
  fail "Install Homebrew, or install ${package_name} manually, then re-run install.sh."
}

check_node() {
  local node_major=""
  if ! command -v node >/dev/null 2>&1; then
    if [[ "${OS}" == "macos" ]]; then
      echo "Node.js 22+ is required. Install it with:" >&2
      echo "  brew install node" >&2
      echo "Verify Node.js:" >&2
      echo "  node -v" >&2
      if ! command -v brew >/dev/null 2>&1; then
        print_homebrew_help
      fi
    else
      echo "Node.js 22+ is required. Install it with:" >&2
      echo "  nvm install 22" >&2
      echo "Verify Node.js:" >&2
      echo "  node -v" >&2
    fi
    exit 1
  fi

  node_major="$(node -p 'process.versions.node.split(".")[0]')"
  if [[ "${node_major}" -lt 22 ]]; then
    if [[ "${OS}" == "macos" ]]; then
      echo "Node.js 22+ is required. Current version: $(node -v)" >&2
      echo "Install/upgrade with: brew install node" >&2
      echo "Verify Node.js: node -v" >&2
    else
      echo "Node.js 22+ is required. Current version: $(node -v)" >&2
      echo "Install/upgrade with: nvm install 22" >&2
      echo "Verify Node.js: node -v" >&2
    fi
    exit 1
  fi

  NODE_BIN="$(command -v node)"
}

port_in_use() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -iTCP:"${port}" -sTCP:LISTEN -n -P >/dev/null 2>&1
    return $?
  fi

  if command -v ss >/dev/null 2>&1; then
    ss -ltn "( sport = :${port} )" | tail -n +2 | grep -q .
    return $?
  fi

  return 1
}

launchd_loaded() {
  launchctl print "gui/$(id -u)/${LABEL}" >/dev/null 2>&1
}

systemd_loaded() {
  systemctl --user status "${SERVICE_NAME}" >/dev/null 2>&1
}

existing_service_guard() {
  if [[ "${FORCE}" -eq 1 ]]; then
    return
  fi

  if [[ "${OS}" == "macos" ]]; then
    if launchd_loaded; then
      fail "An existing Ortega Point Community launchd service is already loaded. Re-run with --force or run ./uninstall.sh first."
    fi
  else
    if systemd_loaded; then
      fail "An existing Ortega Point Community systemd user service is already loaded. Re-run with --force or run ./uninstall.sh first."
    fi
  fi
}

resolve_source_dir() {
  if [[ -f "${SCRIPT_DIR}/package.json" ]] && grep -q '"name": "ortegapoint-community"' "${SCRIPT_DIR}/package.json"; then
    SOURCE_DIR="${SCRIPT_DIR}"
    return
  fi

  REPO_URL="$(prompt_default "Git clone URL for the Ortega Point Community repo" "${REPO_URL}")"
  [[ -n "${REPO_URL}" ]] || fail "No repo URL supplied. Set ORTEGA_REPO_URL or provide it interactively."

  WORK_TMP="$(mktemp -d "${TMP_BASE%/}/ortegapoint-community-install.XXXXXX")"
  SOURCE_DIR="${WORK_TMP}/repo"
  echo "Cloning ${REPO_URL} into a temporary workspace..."
  git clone --depth 1 "${REPO_URL}" "${SOURCE_DIR}"
}

copy_app_tree() {
  mkdir -p "${APP_ROOT}"
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete \
      --exclude='.git' \
      --exclude='node_modules' \
      --exclude='.next' \
      --exclude='.env' \
      "${SOURCE_DIR}/" "${APP_DIR}/"
  else
    rm -rf "${APP_DIR}"
    mkdir -p "${APP_DIR}"
    cp -R "${SOURCE_DIR}/." "${APP_DIR}/"
    rm -rf "${APP_DIR}/.git" "${APP_DIR}/node_modules" "${APP_DIR}/.next"
  fi
}

render_template() {
  local template="$1"
  local output="$2"

  TPL_LABEL="${LABEL}" \
  TPL_USER="${USER_NAME}" \
  TPL_HOME="${HOME}" \
  TPL_APP_DIR="${APP_DIR}" \
  TPL_STORAGE_ROOT="${STORAGE_ROOT}" \
  TPL_DATA_DIR="${DATA_DIR}" \
  TPL_HOSTNAME="${HOST_BIND}" \
  TPL_PORT="${PORT}" \
  TPL_CF_AUD="${CF_AUD}" \
  TPL_CF_TEAM="${CF_TEAM}" \
  TPL_NODE_BIN="${NODE_BIN}" \
  perl -0pe '
    s/__LABEL__/$ENV{TPL_LABEL}/g;
    s/__USER__/$ENV{TPL_USER}/g;
    s/__HOME__/$ENV{TPL_HOME}/g;
    s/__APP_DIR__/$ENV{TPL_APP_DIR}/g;
    s/__STORAGE_ROOT__/$ENV{TPL_STORAGE_ROOT}/g;
    s/__DATA_DIR__/$ENV{TPL_DATA_DIR}/g;
    s/__HOSTNAME__/$ENV{TPL_HOSTNAME}/g;
    s/__PORT__/$ENV{TPL_PORT}/g;
    s/__CF_AUD__/$ENV{TPL_CF_AUD}/g;
    s/__CF_TEAM__/$ENV{TPL_CF_TEAM}/g;
    s/__NODE_BIN__/$ENV{TPL_NODE_BIN}/g;
  ' "${template}" > "${output}"
}

backup_existing_env() {
  if [[ -f "${APP_DIR}/.env" ]]; then
    local stamp
    stamp="$(date +%Y%m%d-%H%M%S)"
    cp "${APP_DIR}/.env" "${APP_DIR}/.env.bak-${stamp}"
    echo "Backed up existing .env to ${APP_DIR}/.env.bak-${stamp}"
  fi
}

write_metadata() {
  cat > "${META_FILE}" <<EOF
LABEL=${LABEL}
SERVICE_NAME=${SERVICE_NAME}
OS=${OS}
MODE=${MODE}
APP_ROOT=${APP_ROOT}
APP_DIR=${APP_DIR}
STORAGE_ROOT=${STORAGE_ROOT}
DATA_DIR=${DATA_DIR}
PORT=${PORT}
HOST_BIND=${HOST_BIND}
PUBLIC_URL=${PUBLIC_URL}
CF_TEAM=${CF_TEAM}
CF_AUD=${CF_AUD}
PUBLIC_DOMAIN=${PUBLIC_DOMAIN}
EOF
}

install_tailscale_if_needed() {
  if command -v tailscale >/dev/null 2>&1; then
    return
  fi

  if [[ "${OS}" == "macos" ]]; then
    require_brew "tailscale"
    if prompt_yes_no "tailscale is not installed. Install it with Homebrew now?" "Y"; then
      brew install tailscale
    else
      fail "tailscale is required for Tailscale mode."
    fi
  else
    echo "tailscale is required for Tailscale mode." >&2
    echo "Install it from: https://tailscale.com/download/linux" >&2
    fail "Install tailscale, connect this machine to your tailnet, then re-run install.sh."
  fi
}

configure_tailscale_mode() {
  MODE="tailscale"
  HOST_BIND="0.0.0.0"

  install_tailscale_if_needed

  if ! tailscale status >/dev/null 2>&1; then
    fail "tailscale is installed but not connected. Run 'tailscale up' first, then re-run install.sh."
  fi

  TAILNET_HOST="$(
    tailscale status --json | node -e '
      let raw = "";
      process.stdin.on("data", d => raw += d);
      process.stdin.on("end", () => {
        const data = JSON.parse(raw);
        const dns = (data.Self && data.Self.DNSName) ? data.Self.DNSName.replace(/\.$/, "") : "";
        process.stdout.write(dns);
      });
    '
  )"
  [[ -n "${TAILNET_HOST}" ]] || fail "Could not detect this machine's Tailscale DNS name."

  PUBLIC_URL="http://${TAILNET_HOST}:${PORT}"
}

install_cloudflared_if_needed() {
  if command -v cloudflared >/dev/null 2>&1; then
    return
  fi

  if [[ "${OS}" == "macos" ]]; then
    require_brew "cloudflared"
    if prompt_yes_no "cloudflared is not installed. Install it with Homebrew now?" "Y"; then
      brew install cloudflared
    else
      fail "cloudflared is required for Cloudflare Tunnel mode."
    fi
    return
  fi

  if command -v apt-get >/dev/null 2>&1; then
    if prompt_yes_no "cloudflared is not installed. Run sudo apt-get install -y cloudflared now?" "Y"; then
      echo "About to run sudo apt-get update && sudo apt-get install -y cloudflared"
      sudo apt-get update
      sudo apt-get install -y cloudflared
    else
      fail "cloudflared is required for Cloudflare Tunnel mode."
    fi
    return
  fi

  echo "cloudflared is required for Cloudflare Tunnel mode." >&2
  echo "Install docs: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/" >&2
  fail "Install cloudflared, then re-run install.sh."
}

configure_cloudflare_mode() {
  MODE="cloudflare"
  HOST_BIND="127.0.0.1"

  install_cloudflared_if_needed

  PUBLIC_DOMAIN="$(prompt_default "Public hostname for Ortega Point Community" "files.example.com")"

  echo
  echo "Cloudflare tunnel setup:"
  echo "  1. cloudflared tunnel login"
  echo "  2. cloudflared tunnel create ortegapoint-community"
  echo "  3. cloudflared tunnel route dns ortegapoint-community ${PUBLIC_DOMAIN}"
  echo "  4. In dash.cloudflare.com -> Zero Trust -> Access -> Applications -> Add,"
  echo "     create an Access app that protects https://${PUBLIC_DOMAIN}"
  echo

  if prompt_yes_no "Run the cloudflared login/create/route commands now?" "Y"; then
    cloudflared tunnel login
    cloudflared tunnel create ortegapoint-community
    cloudflared tunnel route dns ortegapoint-community "${PUBLIC_DOMAIN}"
  fi

  CF_TEAM="$(prompt_default "Cloudflare Access team domain (example: team.cloudflareaccess.com)" "")"
  CF_AUD="$(prompt_default "Cloudflare Access AUD" "")"

  [[ -n "${CF_TEAM}" ]] || fail "Cloudflare mode requires CF team domain."
  [[ -n "${CF_AUD}" ]] || fail "Cloudflare mode requires CF Access AUD."

  PUBLIC_URL="https://${PUBLIC_DOMAIN}"
}

configure_local_mode() {
  MODE="local"
  HOST_BIND="127.0.0.1"
  PUBLIC_URL="http://127.0.0.1:${PORT}"
}

choose_mode() {
  echo
  echo "Choose access mode:"
  echo "  1) Tailscale only (recommended)"
  echo "  2) Cloudflare Tunnel (public URL via your own domain)"
  echo "  3) Local only (127.0.0.1)"
  echo

  local choice=""
  read -r -p "Selection [1]: " choice
  choice="${choice:-1}"

  case "${choice}" in
    1) configure_tailscale_mode ;;
    2) configure_cloudflare_mode ;;
    3) configure_local_mode ;;
    *) fail "Invalid selection: ${choice}" ;;
  esac
}

collect_inputs() {
  STORAGE_ROOT="$(prompt_default "Storage root" "${STORAGE_ROOT}")"
  DATA_DIR="$(prompt_default "App data dir" "${DATA_DIR}")"
  PORT="$(prompt_default "Port" "${PORT}")"

  [[ "${PORT}" =~ ^[0-9]+$ ]] || fail "Port must be numeric."
  if port_in_use "${PORT}"; then
    fail "Port ${PORT} is already in use."
  fi
}

build_app() {
  mkdir -p "${STORAGE_ROOT}" "${DATA_DIR}"
  : > "${LOG_FILE}"

  pushd "${APP_DIR}" >/dev/null
  npm ci
  npm run build
  popd >/dev/null
}

write_env() {
  backup_existing_env
  render_template "${APP_DIR}/templates/env.tmpl" "${APP_DIR}/.env"
}

install_launchd_service() {
  local plist_dir="${HOME}/Library/LaunchAgents"
  local plist_path="${plist_dir}/${LABEL}.plist"
  mkdir -p "${plist_dir}"

  render_template "${APP_DIR}/templates/launchd.plist.tmpl" "${plist_path}"

  if launchd_loaded; then
    launchctl bootout "gui/$(id -u)" "${plist_path}" || true
  fi

  launchctl bootstrap "gui/$(id -u)" "${plist_path}"
  launchctl enable "gui/$(id -u)/${LABEL}"
  launchctl kickstart -k "gui/$(id -u)/${LABEL}"
}

install_systemd_service() {
  local unit_dir="${HOME}/.config/systemd/user"
  local unit_path="${unit_dir}/${SERVICE_NAME}"
  mkdir -p "${unit_dir}"

  render_template "${APP_DIR}/templates/systemd.service.tmpl" "${unit_path}"

  systemctl --user daemon-reload
  systemctl --user enable --now "${SERVICE_NAME}"
}

verify_health() {
  sleep 3
  if ! curl -fsS "http://127.0.0.1:${PORT}/api/health" >/dev/null; then
    if [[ "${OS}" == "macos" ]]; then
      echo "Health check failed. Inspect with:" >&2
      echo "  launchctl print gui/$(id -u)/${LABEL}" >&2
      echo "  tail -n 100 ${LOG_FILE}" >&2
    else
      echo "Health check failed. Inspect with:" >&2
      echo "  systemctl --user status ${SERVICE_NAME}" >&2
      echo "  journalctl --user -u ${SERVICE_NAME} -n 100 --no-pager" >&2
      echo "  tail -n 100 ${LOG_FILE}" >&2
    fi
    exit 1
  fi
}

print_summary() {
  echo
  echo "Ortega Point Community installed successfully."
  echo
  echo "Next steps:"
  echo "  URL: ${PUBLIC_URL}"
  echo "  App dir: ${APP_DIR}"
  echo "  Storage root: ${STORAGE_ROOT}"
  echo "  Data dir: ${DATA_DIR}"
  echo "  Log file: ${LOG_FILE}"
  echo
  if [[ "${MODE}" == "cloudflare" ]]; then
    echo "  Make sure a cloudflared tunnel is running for '${PUBLIC_DOMAIN}' and that"
    echo "  Cloudflare Access is configured in dash.cloudflare.com -> Zero Trust ->"
    echo "  Access -> Applications -> Add."
    echo
  fi
  echo "  Open the app, then click 'New folder' or press 'F' to create your first folder."
}

main() {
  detect_os
  echo "Detected ${OS} (${OS_VERSION})"

  check_node
  require_cmd git "Install git and re-run."
  require_cmd sqlite3 "Install sqlite3 and re-run."
  require_cmd curl "Install curl and re-run."

  existing_service_guard
  resolve_source_dir
  collect_inputs
  choose_mode
  copy_app_tree
  build_app
  write_env
  write_metadata

  if [[ "${OS}" == "macos" ]]; then
    install_launchd_service
  else
    install_systemd_service
  fi

  verify_health
  print_summary
}

main "$@"
