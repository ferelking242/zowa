---
name: Zowa bot domain selection
description: How preferred domain flows through the Telegram bot.
---

## Rule
`session.preferredDomain` (default `'antdev.org'`) is set via the Settings → 🌐 domain picker.
All email generation paths in `server/bot/telegram.ts` must read this value, never hardcode `antdev.org`.

**Why:** User wanted domain choice in bot settings; hardcoded domain would ignore the selection.

**How to apply:** In any bot method that generates an email address for the active user, use:
`const domain = session.preferredDomain || 'antdev.org';`
The domain picker callback is `settings_choose_domain` → shows inline keyboard → `set_domain_{domain}` callbacks.
