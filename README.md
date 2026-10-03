# Basira Provisions — HNG 15 Stage 2

A small neighbourhood-shop storefront: browse products, build a cart, sign in with Google,
check out, and get a confirmation email. Orders are stored per user in Supabase and are still
there after logging out and back in.

**Live:** https://basira-provisions.pages.dev

## Stack

| Layer | Choice |
| --- | --- |
| Frontend | Plain HTML/CSS/JS (`public/`), supabase-js v2 from CDN |
| Auth | Supabase Auth, Google provider (OAuth 2.0, PKCE) |
| Database | Supabase Postgres: `products`, `orders`, `order_items` with row-level security |
| Email | Mailgun via a Cloudflare Pages Function (`functions/api/send-confirmation.ts`) |
| Hosting | Cloudflare Pages (static + Functions) |
| Tests | Vitest (`tests/`), TypeScript typecheck |

## How an order flows

1. Products load from Supabase REST (public read policy).
2. Cart lives in `localStorage` so it survives refresh.
3. Checkout requires a session. The sign-in intent is remembered, so after Google redirects
   back the user lands straight on checkout.
4. The browser inserts the `orders` row and `order_items` rows with the user's own JWT.
   RLS only allows rows where `user_id = auth.uid()`.
5. The browser calls `POST /api/send-confirmation` with the JWT. The function verifies the
   token with Supabase, loads the order *as that user*, sends the Mailgun message, and
   patches `email_sent = true`.
6. "My orders" lists `orders` + nested `order_items`, newest first. Logging out clears the
   session only; the rows stay in Postgres.

## Local development

```bash
npm install
cp .dev.vars.example .dev.vars   # fill in Mailgun values
npm run dev                      # http://localhost:8788
npm test
npm run typecheck
```

`.dev.vars` is git-ignored. Production secrets live in the Pages project's environment variables.

### Environment

| Variable | Where | Purpose |
| --- | --- | --- |
| `SUPABASE_URL` | wrangler.toml | Project URL |
| `SUPABASE_PUBLISHABLE_KEY` | wrangler.toml | Public anon key (safe in browser) |
| `MAILGUN_API_KEY` | secret | Mailgun private API key |
| `MAILGUN_DOMAIN` | secret | e.g. `sandboxXXXX.mailgun.org` |
| `MAILGUN_FROM` | secret | Optional sender, defaults to `postmaster@<domain>` |
| `MAILGUN_REGION` | secret | `eu` for EU accounts, otherwise unset |

Mailgun sandbox domains only deliver to **authorized recipients** (max 5), and Gmail files mail from a sandbox sender under **Spam** (its reply is `250 OK DMARC:Quarantine`). Check Spam when testing. The function
surfaces that case as `reason: "recipient_not_authorized"` and the UI explains it; the order
itself is always saved.

## Database

See `supabase/schema.sql` for tables, policies and seed data. Apply it in the Supabase SQL editor.

## Deploy

```bash
npm run deploy
```

## Docs

- `docs/PRD.md` — product requirements
- `AGENTS.md` — how AI agents should work in this repo
