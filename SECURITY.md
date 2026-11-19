# Security

## Reporting a vulnerability

Please do not open a public issue for a security problem. Use GitHub's private reporting instead: the repository's **Security** tab → **Report a vulnerability**. You will get a reply as soon as a maintainer has read it.

Useful things to include: what you found, how to reproduce it, and what an attacker could do with it.

## What matters most here

- **API keys.** Keys belong only in `.env` (git-ignored) or in CI secrets. If you find a key in the repository, its history, a log or a build output, report it privately so it can be revoked.
- **The Steam relay** (`web/server/`). It holds the Steam Web API key and must never return it, log it, or let a caller reach other hosts through it.
- **Usage stats** (`supabase/`, `web/server/eventsRelay.ts`, `web/src/admin/`). The public key must reach nothing but `log_events`, `admin_stats` must refuse anyone not on the admin list, and no event may carry more than the fields listed in `docs/PRIVACY.md`.
- **Generated share pages** (`web/scripts/build-share-pages.mjs`). Game titles come from an outside source and must be escaped wherever they are written into HTML.

## Supported versions

Only the latest commit on the default branch is supported.
