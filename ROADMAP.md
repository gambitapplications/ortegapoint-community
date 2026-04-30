# Roadmap

Ortega Point Community is intended to be a public, open-source, self-hosted Drive-style workspace that does not expose personal deployment details.

This roadmap is intentionally conservative. Data safety, clear setup, and private-by-default deployment come before team/SaaS-style features.

## Release Priorities

### 1. Public OSS readiness

Goal: make the repository safe and understandable for public use.

- Keep docs generic and install-focused.
- Do not include personal usernames, private domains, IP addresses, Tailnet names, machine names, local storage paths, tokens, or account identifiers.
- Keep example values obviously fake, for example `YOUR_DOMAIN_HERE`, `/path/to/OrtegaPointCommunity`, and `files.example.com`.
- Keep the only visible creator mark as a small designer/developer signature: `gambitapplications`.
- Publish under a `gambitapplications` remote instead of a personal GitHub namespace.
- Before any public release, run a final repository scan for secrets and personal identifiers.

### 2. Data safety

Goal: make Ortega Point Community safe enough for real personal files.

- Document backup setup clearly for macOS and Linux.
- Make backup retention configurable instead of hard-coded.
- Add a backup health/status check so users know whether backups are running.
- Improve `/api/health` or add a deeper diagnostic endpoint for storage, database, upload, and preview checks.
- Add optional automatic trash expiry after a configurable number of days.

### 3. Install and operations polish

Goal: make the app installable by a mildly technical user without hand-editing many files.

- Keep the installer simple and transparent.
- Support local-only, Tailscale-only, and Cloudflare Tunnel + Access modes.
- Improve troubleshooting for port conflicts, Node versions, service failures, and Cloudflare Access misconfiguration.
- Keep deployment examples generic and free of personal infrastructure details.

### 4. Identity awareness, not full multi-user yet

Goal: preserve a path toward users without adding a full permissions system too early.

Current decision:

- Do not add built-in username/password accounts yet.
- Do not add a full multi-user permissions model yet.
- Continue relying on the outer access layer: Tailscale membership or Cloudflare Access.

Possible near-term identity work:

- Read Cloudflare Access identity claims when available.
- Store optional attribution fields such as `created_by`, `updated_by`, `deleted_by`, or `uploaded_by`.
- Show lightweight activity attribution in the UI, for example “uploaded by …”.
- Keep the app usable when no identity header is present.

Reasons to defer full multi-user support:

- The current product is strongest as a private self-hosted workspace.
- Full multi-user permissions would require users, sessions, roles, folder ACLs, sharing UI, migrations, and much more security review.
- Adding users too early could make the app harder to install, audit, and trust.

Triggers for revisiting full multi-user support:

- A real shared-instance use case appears, such as family, clients, collaborators, or a small team.
- Different people need different visibility into folders.
- Read-only/upload-only/delete permissions become necessary.
- Audit history by person becomes important enough to justify the complexity.

Possible future multi-user model, if needed:

- Owner account with full access.
- Optional invited users.
- Per-folder permissions: owner, editor, uploader, viewer.
- Public or expiring share links only if the threat model is revisited.
- Migration path from single-owner storage to ownership/permission metadata.

## Non-Goals For Now

- No SaaS backend.
- No hosted account system.
- No public unauthenticated file sharing.
- No built-in password auth until there is a clear need.
- No personal deployment details in public docs, examples, screenshots, issues, or release notes.
