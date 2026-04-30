# Ortega Point Community

Your own self-hosted Drive for files, folders, notes, search, previews, and trash.

## Install

One-line install, after the public repo exists:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/gambitapplications/ortegapoint-community/main/install.sh)"
```

Manual clone:

```bash
git clone https://github.com/gambitapplications/ortegapoint-community.git
cd ortegapoint-community
./install.sh
```

If you are testing a fork or private mirror, clone that repo instead and run `./install.sh` from the checked-out directory.

## Access Modes

### Tailscale only
Private access over your Tailnet. No domain, no public exposure, and no extra reverse proxy setup.

### Cloudflare Tunnel + CF Access
A public URL protected by Cloudflare Access. Good if you want Google or GitHub sign-in in front of the app.

### Local only
Runs on one machine only. Best for a single desktop, laptop, or home server that never needs remote access.

## Requirements

- Node.js 22+
- macOS 13+ or modern Linux
- Around 200 MB free disk for the app itself
- Extra disk space for your files and previews

See [PREREQUISITES.md](PREREQUISITES.md) for install and verification commands for Homebrew, Node.js, Git, SQLite, Tailscale, and Cloudflare Tunnel.

## What's Included

- Folder tree with nested folders
- File uploads
- Markdown notes
- Global search across folders, files, and note contents
- Previews for text, markdown, CSV, XLSX, images, PDFs, and browser-playable video
- Trash with restore and permanent delete
- SQLite in WAL mode
- Streaming uploads for large files
- Optional Cloudflare Access JWT validation at the origin

## Updating

Pull the latest code, reinstall dependencies, rebuild, then restart the service:

```bash
git pull
npm ci
npm run build
launchctl kickstart -k gui/$(id -u)/com.ortegapoint-community.app
```

If you installed it with `systemd` instead of `launchd`:

```bash
sudo systemctl restart ortegapoint-community
```

## Uninstalling

Run:

```bash
./uninstall.sh
```

## Docs

- [DEPLOY.md](DEPLOY.md)
- [HOSTING.md](HOSTING.md)
- [PREREQUISITES.md](PREREQUISITES.md)
- [CONFIGURE.md](CONFIGURE.md)
- [SECURITY.md](SECURITY.md)
- [ROADMAP.md](ROADMAP.md)

## Public Release Status

This repository is prepared for public source release from a clean, identity-neutral Git history. Do not publish a working copy that still contains private runtime data, local `.env` files, or personal commit metadata.

## Signature

Designed and built by gambitapplications.

## License

MIT
