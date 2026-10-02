# AGENTS.md — working in this repo

This repo was built with an AI coding agent (Claude Code). These notes keep future agents and
humans consistent.

## What this is

Basira Provisions: a static storefront (`public/`) + Cloudflare Pages Functions (`functions/`),
backed by Supabase (auth + Postgres) and Mailgun (email). Live at https://basira-provisions.pages.dev.

## Ground rules

1. **No build step for the frontend.** `public/` is served as-is. Keep `app.js` as plain ES5-ish
   browser JS wrapped in an IIFE; supabase-js comes from the CDN `<script>` in `index.html`.
2. **Money is integers in kobo.** Format with `naira()` only at render time.
3. **RLS is the security boundary.** Never add a service-role key to this project. Server code
   must use the caller's JWT (`Authorization: Bearer`) so Postgres enforces ownership.
4. **Secrets** live in `.dev.vars` (git-ignored) and Pages environment variables. Public config
   (Supabase URL, publishable key) is in `wrangler.toml` and `index.html`.
5. **Fail soft on email.** An order must save even if Mailgun is down or unconfigured; return
   `{ sent:false, reason }` and let the UI explain.
6. **Accessibility.** Buttons have labels, focus is visible, the cart drawer closes on Escape,
   the layout holds at 390px wide.

## Commands

```bash
npm install
npm run dev        # wrangler pages dev on http://localhost:8788 (reads .dev.vars)
npm test           # vitest
npm run typecheck  # tsc on functions + tests
npm run deploy     # wrangler pages deploy public --project-name basira-provisions
```

Run `npm test` and `npm run typecheck` before every deploy.

## Layout

```
public/            index.html, styles.css, app.js, favicon.svg, _headers
functions/api/     send-confirmation.ts (Mailgun), health.ts, _lib/email.ts (pure helpers)
supabase/          schema.sql (tables, RLS policies, seed products)
tests/             vitest specs for the helpers and the endpoint
docs/PRD.md        product requirements
```

## External setup (already done for this deployment)

- Supabase project `shop` (ref `xmxwbcemtzntkgueiwon`): schema applied, Google provider enabled,
  Site URL `https://basira-provisions.pages.dev`, redirect URLs include `https://basira-provisions.pages.dev/**`.
- Google Cloud OAuth client (Web) with redirect
  `https://xmxwbcemtzntkgueiwon.supabase.co/auth/v1/callback` and JS origin
  `https://basira-provisions.pages.dev`.
- Cloudflare Pages project `basira-provisions`.
- Mailgun: sandbox domain; recipients must be added as authorized recipients.

## When changing things

- New product fields → update `schema.sql`, the `select('*')` consumers in `app.js`, and the card template.
- New email content → edit `_lib/email.ts` and extend `tests/email.test.ts`.
- New endpoint → add under `functions/api/`, verify the JWT the same way, add a test that stubs `fetch`.
