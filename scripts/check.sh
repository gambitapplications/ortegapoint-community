#!/usr/bin/env bash
set -euo pipefail

OS="unknown"
OS_VERSION="unknown"
FAIL=0

print_status() {
  local label="$1"
  local status="$2"
  local detail="$3"
  printf '%-20s %-6s %s\n' "${label}" "${status}" "${detail}"
}

detect_os() {
  case "$(uname -s)" in
    Darwin)
      OS="macOS"
      OS_VERSION="$(sw_vers -productVersion)"
      ;;
    Linux)
      OS="Linux"
      if [[ -r /etc/os-release ]]; then
        # shellcheck disable=SC1091
        source /etc/os-release
        OS_VERSION="${PRETTY_NAME:-$(uname -r)}"
      else
        OS_VERSION="$(uname -r)"
      fi
      ;;
    *)
      OS="$(uname -s)"
      OS_VERSION="$(uname -r)"
      ;;
  esac
}

check_node() {
  if ! command -v node >/dev/null 2>&1; then
    print_status "Node" "FAIL" "missing (need 22+)"
    FAIL=1
    return
  fi

  local version major
  version="$(node -v)"
  major="$(node -p 'process.versions.node.split(".")[0]')"
  if [[ "${major}" -ge 22 ]]; then
    print_status "Node" "PASS" "${version}"
  else
    print_status "Node" "FAIL" "${version} (need 22+)"
    FAIL=1
  fi
}

check_cmd() {
  local label="$1"
  local cmd="$2"
  local required="${3:-no}"
  if command -v "${cmd}" >/dev/null 2>&1; then
    print_status "${label}" "PASS" "$(command -v "${cmd}")"
  else
    print_status "${label}" "$( [[ "${required}" == "yes" ]] && echo "FAIL" || echo "WARN" )" "missing"
    if [[ "${required}" == "yes" ]]; then
      FAIL=1
    fi
  fi
}

check_tailscale() {
  if ! command -v tailscale >/dev/null 2>&1; then
    print_status "tailscale" "WARN" "not installed"
    return
  fi

  if tailscale status >/dev/null 2>&1; then
    print_status "tailscale" "PASS" "installed and connected"
  else
    print_status "tailscale" "WARN" "installed but not connected"
  fi
}

check_cloudflared() {
  if command -v cloudflared >/dev/null 2>&1; then
    print_status "cloudflared" "PASS" "$(command -v cloudflared)"
  else
    print_status "cloudflared" "WARN" "not installed"
  fi
}

check_disk() {
  local line
  line="$(df -h "$HOME" | tail -1)"
  print_status "Free disk" "INFO" "${line}"
}

check_port_3000() {
  if command -v lsof >/dev/null 2>&1; then
    if lsof -iTCP:3000 -sTCP:LISTEN -n -P >/dev/null 2>&1; then
      print_status "Port 3000" "WARN" "already in use"
    else
      print_status "Port 3000" "PASS" "available"
    fi
    return
  fi

  if command -v ss >/dev/null 2>&1; then
    if ss -ltn "( sport = :3000 )" | tail -n +2 | grep -q .; then
      print_status "Port 3000" "WARN" "already in use"
    else
      print_status "Port 3000" "PASS" "available"
    fi
    return
  fi

  print_status "Port 3000" "WARN" "could not determine"
}

main() {
  detect_os
  print_status "OS" "INFO" "${OS} ${OS_VERSION}"
  check_node
  check_cmd "git" "git" "yes"
  check_cmd "sqlite3" "sqlite3" "yes"
  check_cmd "curl" "curl" "yes"
  check_cmd "rsync" "rsync" "no"
  check_tailscale
  check_cloudflared
  check_disk
  check_port_3000

  exit "${FAIL}"
}

main "$@"
