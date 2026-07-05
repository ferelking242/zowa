---
name: Bot antdev.org migration
description: The bot had antdev.org hardcoded everywhere; migration to epmtyfl.me and dynamic getAllDomains()[0].
---

## What was done
`sed -i 's/antdev\.org/epmtyfl.me/g'` + targeted regex fix for the email validation patterns.

## Email validation in bot
Old: `/^[a-zA-Z0-9]+\d*@antdev\.org$/` — only accepted antdev.org.
New: accept any email whose domain is in `getAllDomains()`, or (for `awaitingEmailAddress`) any syntactically valid email.

**Why:** The bot should accept all supported domains when users enter addresses manually.

## generateRandomEmailAddress (bot)
Now uses 30 hero-style names (`godfrost`, `flashnova`, etc.) + 4-digit random number = 270k+ unique combos.
Same approach used in `client/src/hooks/use-email.tsx` for web generation.

## Default domain
`session.preferredDomain || getAllDomains()[0]` everywhere. `getAllDomains()[0]` resolves to `epmtyfl.me` (first domain of first provider = DevTai).
