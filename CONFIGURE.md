# Configuration

This document lists every environment variable used by Ortega Point Community and the related helper scripts.

## Where Values Are Read

Main app config:

- `lib/config.js`
- `middleware.js`

Supporting scripts:

- `scripts/backup.sh`
- `scripts/disk-watch.sh`

Runtime-only values:

- `HOSTNAME` and `PORT` are read by the Next.js server process at startup, not by `lib/config.js`

## Required

### `ORTEGA_STORAGE_ROOT`

What it does:

- Absolute path to the folder where your real files and folders live
- The app creates and manages content under this root
- Trash for file and folder deletes is stored under `<storage root>/.trash/`

Read from:

- `lib/config.js`
- many storage operations under `lib/store.js` use the resolved value

Default if unset:

```bash
./data/storage
```

Example:

```bash
ORTEGA_STORAGE_ROOT=/path/to/OrtegaPointCommunity
```

### `ORTEGA_DATA_DIR`

What it does:

- Absolute path to the app data directory
- Stores the SQLite database at `ortegapoint-community.sqlite`

Read from:

- `lib/config.js`
- used by `lib/db.js`

Default if unset:

```bash
./data
```

Example:

```bash
ORTEGA_DATA_DIR=/path/to/.ortegapoint-community/data
```

### `PORT`

What it does:

- TCP port the Next.js server listens on

Read from:

- Next.js runtime startup

Common values:

- `3000` for most installs

Example:

```bash
PORT=3000
```

### `HOSTNAME`

What it does:

- Bind address for the app server

Read from:

- Next.js runtime startup

Recommended values:

- `0.0.0.0` for Tailscale mode
- `127.0.0.1` for Local-only mode
- `127.0.0.1` for Cloudflare Tunnel mode

Example:

```bash
HOSTNAME=127.0.0.1
```

## Upload Tuning

### `ORTEGA_MAX_UPLOAD_MB`

What it does:

- Maximum single-file upload size, in megabytes
- Used by the streaming upload route and upload helpers

Read from:

- `lib/config.js`
- enforced in upload code under `app/api/files/route.js` and `lib/store.js`

Default if unset:

```bash
500
```

Notes:

- The repo hard-codes a fallback default of `500`
- If you want a higher limit, set it explicitly, for example `20000` for 20 GB

Example:

```bash
ORTEGA_MAX_UPLOAD_MB=20000
```

## Cloudflare Access

These are optional. Leave them blank in Tailscale-only and Local-only modes.

### `CF_ACCESS_TEAM_DOMAIN`

What it does:

- Your Cloudflare Access team domain
- Used to fetch the Cloudflare Access JWKS and validate JWTs

Read from:

- `middleware.js`

Example:

```bash
CF_ACCESS_TEAM_DOMAIN=your-team.cloudflareaccess.com
```

### `CF_ACCESS_AUD`

What it does:

- Audience value for your Cloudflare Access self-hosted application
- Must match the Access app protecting your public URL

Read from:

- `middleware.js`

Example:

```bash
CF_ACCESS_AUD=your-access-audience
```

Behavior:

- If either Cloudflare Access value is missing, the middleware logs a warning and skips JWT validation
- `/api/health` is always exempt from the middleware check

## Alerting

These are only used by the disk-watch helper script.

### `TELEGRAM_BOT_TOKEN`

What it does:

- Bot token used to send disk alerts through Telegram

Read from:

- `scripts/disk-watch.sh`

Example:

```bash
TELEGRAM_BOT_TOKEN=123456:ABCDEF...
```

### `TELEGRAM_CHAT_ID`

What it does:

- Target Telegram chat ID for disk alerts

Read from:

- Intended for `scripts/disk-watch.sh`

Important:

- If either `TELEGRAM_BOT_TOKEN` or `TELEGRAM_CHAT_ID` is unset, `disk-watch.sh` runs in log-only mode (no alerts sent)

## Backup

### `ORTEGA_BACKUP_DIR`

What it does:

- Destination directory for backup snapshots created by `scripts/backup.sh`

Read from:

- `scripts/backup.sh`

Default if unset:

```bash
$HOME/ortegapoint-community-backups
```

Example:

```bash
ORTEGA_BACKUP_DIR=/Volumes/BackupDrive/ortegapoint-community-backups
```

### Backup retention

Current behavior:

- `scripts/backup.sh` keeps the last `14` snapshots

Important:

- Retention is not currently configurable by environment variable
- The value is hard-coded as `RETAIN=14` in `scripts/backup.sh`

## Source Summary

- `lib/config.js`: `ORTEGA_STORAGE_ROOT`, `ORTEGA_DATA_DIR`, `ORTEGA_MAX_UPLOAD_MB`
- `middleware.js`: `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`
- Next.js runtime: `HOSTNAME`, `PORT`
- `scripts/disk-watch.sh`: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`
- `scripts/backup.sh`: `ORTEGA_STORAGE_ROOT`, `ORTEGA_DATA_DIR`, `ORTEGA_BACKUP_DIR`
