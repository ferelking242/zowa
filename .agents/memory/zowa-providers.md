---
name: Zowa email providers
description: How email provider routing works; which APIs are implemented.
---

## Rule
Provider routing is in `server/services/emailService.ts` → `getApiTypeForEmail()`.
- `tempmail` → TempMail API `https://api.temp-mail.org/request/mail/id/{md5}/format/json` — used for `@homephit.com`
- `onesecmail` → 1SecMail API `https://www.1secmail.com/api/v1/` — used for `@1secmail.{com,org,net}`
- `devtai` (default) → DevTai API `https://email.devtai.net/api` — used for antdev.org and others

**Why:** Guerrilla (session-based) and Maildrop (GraphQL) are complex; they fall back to DevTai. Don't add their domains to `EMAIL_PROVIDERS` without implementing their API handlers first.

**How to apply:** When adding a new domain, add `apiType` to its provider entry in `shared/email-providers.ts` and add a matching branch in `emailService.getMessages()`.
