# Security

## Default Threat Model

### Tailscale mode
The app is private by Tailnet membership. Anyone who can reach the machine over your Tailnet can reach Ortega Point Community.

### Cloudflare Tunnel + Access mode
The app is intended to sit behind Cloudflare Access. Cloudflare handles the outer identity gate, and Ortega Point Community can validate the Access JWT at the origin when `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD` are set.

### Local-only mode
The app is only reachable on the machine where it runs, usually over `127.0.0.1`.

## What the App Does Not Do

- No built-in username/password system
- No built-in multi-user permissions model
- No TLS termination by itself
- No public-internet exposure by default
- No automatic safe public exposure unless you explicitly choose Cloudflare Tunnel mode

Use Ortega Point Community behind Tailscale or behind Cloudflare Tunnel + Cloudflare Access. Do not bind it directly to a public interface and open the port to the internet.

## Secrets to Protect

Treat these as secrets:

- Your `.env` file
- `CF_ACCESS_AUD`
- `CF_ACCESS_TEAM_DOMAIN`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- Your Cloudflare Tunnel UUID
- Your tunnel credentials JSON file

If any of these land in a public repo, treat that as a leak and rotate them.

## Reporting Vulnerabilities

Please report security issues to:

- GitHub Security Advisories on the public repository
- A private issue or direct maintainer contact listed by `gambitapplications`

## Known Limitations

These are current repo limitations, not promises of future behavior.

### Health check is shallow

`/api/health` only verifies that:

- the storage root can be created or opened
- the SQLite database can be opened

It does not verify:

- uploads
- previews
- search behavior
- outer access control
- end-to-end remote reachability

### No CSRF protection

The app uses server actions and routes without a dedicated CSRF defense layer. This is acceptable for a private, single-owner deployment behind a strong outer gate, but it is still a limitation.

### Cloudflare Access enforcement can soft-fail open

If `CF_ACCESS_TEAM_DOMAIN` or `CF_ACCESS_AUD` is missing, `middleware.js` logs a warning and skips JWT validation instead of locking the owner out. That is convenient for recovery, but it also means a misconfigured public deployment could be less protected than intended.

### `/api/health` is excluded from Access checks

This is by design for monitoring, but it means the health route is less protected than the rest of the app.

### Large downloads are not streamed

The file download route currently reads the target file into memory before returning it. Uploads have a streaming path, but downloads do not.

### Trash view is not paginated

Trash items are loaded as a full list. That is fine for personal use, but not optimized for very large trash sets.

### No automatic trash expiry

Trash is manual today. Items remain until restored, permanently deleted, or emptied.

### No built-in backup scheduler in the app

Backup and disk alerts are helper scripts, not core app features. They must be installed and scheduled separately.

## Practical Guidance

For the safest personal setup:

1. Use Tailscale-only mode if you do not need a public URL.
2. Use Cloudflare Tunnel + Access if you do need a public URL.
3. Keep `.env`, tunnel credentials, and Telegram tokens out of git.
4. Put your storage root on reliable disk.
5. Enable backups before trusting the app with irreplaceable files.
