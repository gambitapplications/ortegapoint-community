# Hosting Ortega Point Community

Ortega Point Community is a self-hosted file-and-notes workspace. You run it on a device you control, choose where your files live on disk, and decide how other devices reach it.

## Quick Start

After the public repository exists, the intended install command is:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/gambitapplications/ortegapoint-community/main/install.sh)"
```

The installer asks for:

- Storage root: where uploaded files and folders live
- App data dir: where SQLite metadata lives
- Port: default `3000`
- Access mode: Tailscale, Cloudflare Tunnel, or local only
- Cloudflare Access values, only if you choose Cloudflare mode

Until the public repo exists, use the manual clone flow in [README.md](README.md).

Before running the installer on a new host, follow [PREREQUISITES.md](PREREQUISITES.md) to install and verify Node.js, Git, SQLite, and any optional network tools.

## Host Device

Use a dedicated always-on device if you want the app to be reliably available.

Good options:

- Mac mini
- MacBook or desktop Mac that stays awake
- Linux mini PC
- Linux server or VPS
- Home server with a reliable disk

Recommended baseline:

- Node.js 22+
- macOS 13+ or a modern Linux distribution
- 2 GB RAM minimum
- 4 GB RAM or more recommended
- Reliable SSD or external drive for storage
- Enough disk space for your files plus backups
- Stable network connection

The app itself is small. Your file storage and backups determine the real disk requirement.

## Storage Planning

Use separate paths for files and app metadata:

- File storage: large disk, external drive, or mounted volume
- App data: reliable local disk for SQLite metadata
- Backups: separate disk or separate backup location

Example:

```bash
Storage root: /srv/ortegapoint-community/storage
App data dir: /srv/ortegapoint-community/data
Backup dir: /srv/ortegapoint-community/backups
```

For important files, do not rely on the same disk as the only backup.

## Access Modes

### Local Only

Use local-only mode if you only need the app on the host machine.

Result:

```text
http://127.0.0.1:3000
```

No domain is needed. Nothing is exposed to the network.

### Tailscale Only

Use Tailscale mode if you want private access from your own devices without buying a domain.

You need:

- Tailscale installed on the host
- Tailscale installed on each device that should access the app
- All devices signed into the same Tailnet

Result:

```text
http://<tailscale-ip>:3000
http://<tailnet-hostname>:3000
```

This is the recommended personal setup for most users.

### Domain + Cloudflare Tunnel + Access

Use this mode if you want a normal HTTPS URL.

You need:

- A domain name
- The domain managed in Cloudflare DNS
- `cloudflared` installed on the host
- A Cloudflare Tunnel pointed at `http://127.0.0.1:3000`
- A Cloudflare Access app protecting the hostname

Example result:

```text
https://files.example.com
```

In this mode, keep Ortega Point Community bound to `127.0.0.1`. Do not expose port `3000` directly to the internet.

## Domain Checklist

For domain-based hosting:

1. Buy or use a domain.
2. Add it to Cloudflare DNS.
3. Install `cloudflared` on the host.
4. Create a tunnel named `ortegapoint-community`.
5. Route a hostname such as `files.example.com` to that tunnel.
6. Create a Cloudflare Access self-hosted app for that hostname.
7. Allow only the identities that should access the app.
8. Paste the Cloudflare team domain and Access AUD into the installer.

## Security Basics

- Do not commit `.env` files.
- Do not publish tunnel credentials.
- Do not expose the app directly on a public port.
- Use Tailscale or Cloudflare Access as the outer security gate.
- Keep backups before storing irreplaceable files.
- Keep the host patched.
- Keep Node.js current within the supported version range.

## After Install

Check local health:

```bash
curl http://127.0.0.1:3000/api/health
```

Then open the URL printed by the installer and create your first folder.

For deeper setup details, see:

- [PREREQUISITES.md](PREREQUISITES.md)
- [DEPLOY.md](DEPLOY.md)
- [CONFIGURE.md](CONFIGURE.md)
- [SECURITY.md](SECURITY.md)
