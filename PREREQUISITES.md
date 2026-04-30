# Prerequisites

Ortega Point Community is installed from the terminal. The installer can set up the app service, but the host machine needs a few basic tools first.

Required:

- `curl`
- `git`
- `sqlite3`
- Node.js 22 or newer
- `npm`, included with Node.js

Optional:

- `tailscale`, only for Tailscale mode
- `cloudflared`, only for Cloudflare Tunnel mode

## macOS

Homebrew is not part of Ortega Point Community, but it is the easiest way to install the required tools on macOS.

Check whether Homebrew is already installed:

```bash
brew --version
```

Install Homebrew:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Verify Homebrew:

```bash
brew --version
```

Install required tools:

```bash
brew install node git sqlite
```

Verify required tools:

```bash
node -v
npm -v
git --version
sqlite3 --version
curl --version
```

Node must be version 22 or newer.

For Tailscale mode:

```bash
brew install tailscale
tailscale version
```

Then connect the host to your Tailnet:

```bash
sudo tailscale up
tailscale status
```

For Cloudflare Tunnel mode:

```bash
brew install cloudflared
cloudflared --version
```

## Linux

For Debian or Ubuntu hosts, install the basic tools first:

```bash
sudo apt-get update
sudo apt-get install -y curl git sqlite3 ca-certificates
```

Verify them:

```bash
curl --version
git --version
sqlite3 --version
```

Install `nvm`, then install Node.js 22:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.4/install.sh | bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm install 22
nvm alias default 22
```

Verify Node.js:

```bash
node -v
npm -v
```

For Tailscale mode:

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
tailscale status
```

For Cloudflare Tunnel mode, follow Cloudflare's current Linux package instructions, then verify:

```bash
cloudflared --version
```

Cloudflare's dashboard can also provide a host-specific tunnel install command after you create a tunnel.

## Preflight Check

After installing prerequisites, run this from the repo:

```bash
./scripts/check.sh
```

The required checks should pass before you run:

```bash
./install.sh
```
