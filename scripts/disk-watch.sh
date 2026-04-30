#!/bin/bash
# Ortega Point Community disk-space watch. Runs under launchd (macOS) or systemd (Linux).
# Alerts via Telegram when the storage volume is low, one alert per state change.
# If TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is unset, logs-only (no alerts).

set -u

STORAGE_ROOT="${ORTEGA_STORAGE_ROOT:-$HOME/ortegapoint-community-storage}"
STATE_DIR="$HOME/.cache/ortegapoint-community-disk"
mkdir -p "$STATE_DIR"

LOW_PCT=10
RECOVER_PCT=12

LINE=$(/bin/df -k "$STORAGE_ROOT" | tail -1)
AVAIL_KB=$(echo "$LINE" | awk '{print $4}')
CAP=$(echo "$LINE" | awk '{print $5}' | tr -d '%')
FREE_PCT=$((100 - CAP))
FREE_GB=$((AVAIL_KB / 1024 / 1024))

PREV_STATE=$(cat "$STATE_DIR/state" 2>/dev/null || echo OK)

send() {
  local msg="$1"
  if [ -z "${TELEGRAM_BOT_TOKEN:-}" ] || [ -z "${TELEGRAM_CHAT_ID:-}" ]; then
    return 0
  fi
  /usr/bin/curl -s --max-time 10 \
    --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" \
    --data-urlencode "text=${msg}" \
    "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" >/dev/null || true
}

NEXT_STATE="$PREV_STATE"
if [ "$FREE_PCT" -lt "$LOW_PCT" ] && [ "$PREV_STATE" != "LOW" ]; then
  NEXT_STATE=LOW
  send "Ortega Point Community disk low: ${FREE_PCT}% free (${FREE_GB} GB left on $(hostname -s)). Empty trash or archive something."
elif [ "$FREE_PCT" -ge "$RECOVER_PCT" ] && [ "$PREV_STATE" = "LOW" ]; then
  NEXT_STATE=OK
  send "Ortega Point Community disk recovered: ${FREE_PCT}% free (${FREE_GB} GB)."
fi
echo "$NEXT_STATE" > "$STATE_DIR/state"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] free=${FREE_PCT}% (${FREE_GB} GB) state=$NEXT_STATE" >> "$STATE_DIR/watch.log"
