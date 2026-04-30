# Deploying Ortega Point Community

Ortega Point Community supports three install shapes:

1. Tailscale only
2. Cloudflare Tunnel + Cloudflare Access
3. Local only

Start with the simplest mode that fits your needs. You can upgrade later without moving your data.

## Prerequisites

Before you start:

- Node.js 22 or newer
- A machine running macOS 13+ or modern Linux
- A storage path for your files
- A data path for the SQLite database and app state
- The repo checked out locally, or the installer script

For hardware, storage, and domain-planning guidance, start with [HOSTING.md](HOSTING.md). For dependency install commands and verification steps, see [PREREQUISITES.md](PREREQUISITES.md).

Recommended defaults:

- Keep your files on a large disk or external SSD
- Keep app data on a reliable local disk
- Use `127.0.0.1` for Local-only and Cloudflare modes
- Use `0.0.0.0` for Tailscale mode

## Mode 1: Tailscale

Tailscale is a private mesh VPN built on WireGuard. It lets your devices reach each other over a private network without exposing the app to the public internet.

Install Tailscale on the host and on every phone, tablet, or laptop that should reach Ortega Point Community.

Install link:

- https://tailscale.com/download

Bring the host online:

```bash
sudo tailscale up
```

Find the host’s Tailnet name:

```bash
tailscale status
tailscale ip -4
tailscale ip -6
```

Typical setup for Ortega Point Community in this mode:

- `HOSTNAME=0.0.0.0`
- `PORT=3000`
- Leave `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD` blank

Start Ortega Point Community, then open it from another Tailscale-connected device using either:

- `http://<tailscale-ip>:3000`
- `http://<tailnet-hostname>:3000`

To connect phones and laptops:

1. Install Tailscale on each device.
2. Sign into the same Tailnet.
3. Open the Ortega Point Community URL from that device.

This is the recommended default for most personal installs.

## Mode 2: Cloudflare Tunnel + Cloudflare Access

Use this mode if you want a normal HTTPS URL with Google or GitHub sign-in in front of the app.

### 1. Buy or use a domain

You need a domain managed in Cloudflare DNS.

### 2. Create a Cloudflare account

If you do not already have one, create an account and add your domain to Cloudflare.

### 3. Install `cloudflared`

Install docs:

- https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/

Authenticate the host with Cloudflare:

```bash
cloudflared tunnel login
```

### 4. Create a tunnel

```bash
cloudflared tunnel create ortegapoint-community
```

This prints a tunnel UUID. Treat it like a secret.

### 5. Route a DNS hostname to the tunnel

Example:

```bash
cloudflared tunnel route dns ortegapoint-community files.example.com
```

### 6. Create a `cloudflared` config

Example config file:

```yaml
tunnel: <tunnel-uuid>
credentials-file: /home/YOU/.cloudflared/<tunnel-uuid>.json

ingress:
  - hostname: files.example.com
    service: http://127.0.0.1:3000
  - service: http_status:404
```

Run the tunnel:

```bash
cloudflared tunnel run ortegapoint-community
```

Or install it as a service using Cloudflare’s service-install flow for your OS.

### 7. Create a Cloudflare Access application

In the dashboard, go to:

- `Zero Trust`
- `Access`
- `Applications`
- `Add an application`
- `Self-hosted`

Then:

1. Set the application name to something like `Ortega Point Community`.
2. Set the domain to your public hostname, for example `files.example.com`.
3. Add an allow policy for the identities you want to use.
4. Save the application.

Recommended identity providers:

- Google
- GitHub
- One-time PIN for low-friction personal use

### 8. Copy the values Ortega Point Community needs

You need:

- Your team domain, usually something like `your-team.cloudflareaccess.com`
- The application audience value (`AUD`) from the Access app you created

Paste those into the installer if it prompts you, or set them in your env file:

```bash
HOSTNAME=127.0.0.1
PORT=3000
CF_ACCESS_TEAM_DOMAIN=your-team.cloudflareaccess.com
CF_ACCESS_AUD=your-access-audience
```

Important:

- Keep Ortega Point Community bound to `127.0.0.1` in this mode
- Let Cloudflare Tunnel be the public entrypoint
- Do not expose port `3000` directly to the internet

## Mode 3: Local Only

Use this mode when the app only needs to run on one machine.

Recommended env:

```bash
HOSTNAME=127.0.0.1
PORT=3000
```

Then start the app and open:

- `http://127.0.0.1:3000`
- `http://localhost:3000`

Do not set Cloudflare Access env vars in this mode.

## Upgrading Later

You can move between modes without changing your storage root or SQLite data directory.

### Local only → Tailscale

1. Install Tailscale on the host.
2. Run `tailscale up`.
3. Change `HOSTNAME` from `127.0.0.1` to `0.0.0.0`.
4. Restart the app.

### Tailscale → Cloudflare

1. Keep the app running.
2. Change `HOSTNAME` back to `127.0.0.1`.
3. Set up `cloudflared`.
4. Create the DNS route.
5. Create the Cloudflare Access app.
6. Set `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD`.
7. Restart the app and test through the public URL.

### Local only → Cloudflare

1. Set `HOSTNAME=127.0.0.1`.
2. Set up `cloudflared`.
3. Create the Access app.
4. Add `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD`.
5. Restart and test.

Your files and database stay where they are as long as `ORTEGA_STORAGE_ROOT` and `ORTEGA_DATA_DIR` do not change.

## Troubleshooting

### Port 3000 is already in use

Check what is listening:

```bash
lsof -i :3000
```

Either stop the conflicting process or change `PORT`.

### Wrong Node version

Check the version:

```bash
node -v
```

Ortega Point Community requires Node 22+ because it uses `node:sqlite`.

### The app service will not start

If you use `systemd`:

```bash
sudo systemctl status ortegapoint-community
sudo journalctl -u ortegapoint-community -n 100 --no-pager
```

Common causes:

- Bad paths in `ORTEGA_STORAGE_ROOT` or `ORTEGA_DATA_DIR`
- Missing `npm ci`
- Build not completed
- Wrong Node version
- Wrong working directory in the service unit

If you use `launchd`, inspect the service logs and confirm:

- The plist points at the right working directory
- The env file path is correct
- `npm run build` completed before restart

### Cloudflare mode returns 403

Check:

- `CF_ACCESS_TEAM_DOMAIN` is correct
- `CF_ACCESS_AUD` matches the Access application
- Requests are reaching the app through Cloudflare, not directly
- You restarted the app after changing env vars

### Tailscale mode is unreachable

Check:

```bash
tailscale status
tailscale ping <other-device-name>
```

Also confirm the host firewall is not blocking the app port.

### Health check looks OK but the app still has problems

`/api/health` is intentionally shallow. It confirms the storage root and SQLite DB can be opened, but it does not verify uploads, previews, or your outer access layer.
