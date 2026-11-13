# Timmy · Bridgebox AI

Private, installable **mobile-first progressive web app** (PWA) based on the original Timmy AI prototype (retained in `foundation/`). **Railway is not used.** GitHub is the source of truth and Vercel is the intended host.

## Implemented

- Home-screen installation with standalone display, offline shell and 192/512 icons.
- Mobile voice recording → OpenAI Whisper transcription; voice playback in the foreground.
- AI conversation using OpenAI Responses API with `store:false`.
- Private, invitation-only Supabase Auth with email OTP; browser refresh sessions.
- Persistent conversation history and user-approved memory scoped to nine project workspaces.
- Supabase RLS for per-user access; message count cap, content caps and server-side API secrets.
- No database service key is shipped to clients, and no private responses are cached by the service worker.
- Original prototype and its Python test preserved under `foundation/`.

## What is NOT implemented

The original prototype did **not** provide real computer-control, Gmail/Calendar tools, scheduled automations, persistent background voice activation, native push notifications, encrypted-at-rest per-workspace keys, autonomous software deployment, or verified backup/restore. This PWA does not pretend to have those features. Microphone operation stops when iOS closes/suspends the app. Do not use for confidential legal/financial records until a full operational security assessment and retention/backup plan are complete.

## Production setup — no Railway

1. **Supabase:** Use a dedicated project. In Auth → Users, **invite or add your email**. Disable public self-registration, enable email OTP, enable MFA for the owner if offered. Add the approved redirect URL `https://timmy.bridgebox.ai`. Change the email OTP template to show `{{ .Token }}` instead of only a confirmation URL, so an installed iPhone app can accept the six-digit code without leaving standalone mode.
2. Run [`supabase/migrations/0001_timmy.sql`](supabase/migrations/0001_timmy.sql) using the SQL editor. Validate select/insert/delete **allow for one invited user and deny for another and anon**, as well as child-message ownership. Do this against a staging environment before production.
3. **Vercel:** Import `nedpearson/Timmy` as an **Other** project (root directory `/`, framework preset `Other`), deploy. Add the environment variables below (Production + Preview as appropriate). Vercel Functions are in `/api` and static files are in `/public`.
4. Add custom domain `timmy.bridgebox.ai` to the Vercel project. Create the exact CNAME record shown in Vercel's Domain Settings at your DNS provider. **Do not overwrite existing DNS blindly.** Confirm HTTPS certificate, `GET /api/health` returns `ready:true` and `/api/config` returns public config.
5. Send OTP to the invited email, verify account access, start a conversation, confirm it persists after reload, save a memory, switch workspaces and confirm no leakage. Test an unauthorized second account, OpenAI failure state, message cap, and phone microphone permission.
6. On iPhone, open `https://timmy.bridgebox.ai` in Safari → Share → Add to Home Screen. On Android, use browser Install app action.

### Required environment variables

| Name | Purpose |
| --- | --- |
| `SUPABASE_URL` | Dedicated Supabase project HTTPS URL |
| `SUPABASE_ANON_KEY` | Project publishable/anon key; NOT service role |
| `OPENAI_API_KEY` | Server-only OpenAI API key; do NOT expose in client |
| `OPENAI_MODEL` | Optional; defaults to `gpt-4.1-mini` |
| `MAX_DAILY_MESSAGES` | Optional user-message cap (default 80; upper-bound 500) |

Put the actual values **only** in Vercel environment settings. `.env.example` is illustrative, never place secrets in git.

### Verify

```sh
npm test
npm run test:foundation
```

Other shell checks:

```sh
node --check public/app.js
node --check api/chat.js
node --check api/transcribe.js
```

Deployment rollback: revert the GitHub commit from Vercel's linked `main` branch (or use Vercel Rollback) to restore the last known good version. Supabase database migrations require separately planned and backed-up reversals. Do not roll back data schema by deleting tables on a live system.

## Architecture notes

The PWA uses Supabase Auth REST and PostgREST with the logged-in user's access JWT. The hosted API independently calls `/auth/v1/user` before contacting OpenAI. Postgres policies require `auth.uid()=user_id`; a composite foreign key binds each message to a conversation with the same owner. Saved memories are explicit and editable/deletable; prior chat is retained until user deletes it in Supabase (full deletion UI is a follow-up). Workspace names match the original foundation's registry. AI responses are not used to autonomously execute computer actions. Secrets and tokens must never be stored in saved memories.
