---
name: Email providers setup
description: Which providers work from Replit, how they are implemented, and the deterministic password trick for mail.tm.
---

## Working providers (as of 2025-07)
- **DevTai** (`epmtyfl.me`, `antdev.org`, `sptech.io.vn`, `stackfl.site`) — default, no auth needed, just query by email. apiType: `devtai`.
- **Guerrilla Mail** (`guerrillamail.com`, `grr.la`, `spam4.me`, etc.) — session-based: create sid_token via `get_email_address`, then `set_email_user`. Store sessions in Map keyed by username. apiType: `guerrilla`.
- **mail.tm** (`web-library.net`) — account-based: POST /accounts, POST /token → JWT. apiType: `mailtm`.

## Removed (dead/blocked from Replit)
- `api.temp-mail.org` / homephit.com — DNS unreachable
- 1secmail — 403 blocked
- maildrop — endpoint dead

## mail.tm deterministic password
**Why:** If we generate a random password on each server start, we lose access to previously-registered accounts on restart.
**How:** `sha256('mailtm:zowa2025:' + email).slice(0, 24)` — same email always yields same password, so we can always recover the token.

## Pre-registration endpoint
`POST /api/email/register` → calls `emailService.preRegisterEmail(email)`.
Must be called immediately after generating a mail.tm or Guerrilla address so the account exists before someone sends an email to it.

## Guerrilla message tracking
`guerrillaMsgOwner: Map<msgId, username>` is populated in `getGuerrillaMessages` so `getMessageDetails` can look up the correct session for full content fetch.
