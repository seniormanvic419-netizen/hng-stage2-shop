# PRD — Basira Provisions (HNG 15 Stage 2)

**Owner:** Bayode Manuel (Zedu: Senior Man) · **Built with:** Claude Code · **Date:** 2 October 2026

## 1. Problem

A small Lagos provisions shop takes orders over WhatsApp and loses track of who ordered what.
Customers want to see prices, order in a minute, and get something written down confirming it.

## 2. Goal

A public web shop where a customer can sign in with Google, add products to a cart, check out,
receive a confirmation email, and see their past orders whenever they log back in.

## 3. Users

- **Customer**: browses on a phone, signs in with the Google account they already have.
- **Shop owner**: reads orders in Supabase for now (no admin UI in this stage).
- **Grader**: must be able to complete the full flow on the live URL.

## 4. Scope

### Must have (Stage 2 requirements)
- Product listing with name, description, price and category filter.
- Cart: add, change quantity, remove, running total; persists across refresh.
- Checkout form: name, email, delivery address (phone optional).
- Google sign-in via Supabase Auth; checkout requires a session.
- Orders and items persisted in Supabase, scoped to the user with RLS.
- Confirmation email on order via Mailgun.
- "My orders" page; orders remain after logout and reappear on next login.
- Deployed publicly, repo with PRD and AGENTS.md.

### Nice to have (done)
- Sign-in intent memory: after the OAuth redirect, the user lands where they were heading.
- Thank-you page reports email status honestly (sent / sandbox-restricted / not configured).
- Server verifies the Supabase JWT and loads the order through RLS, so a user can only trigger
  emails for their own orders.
- Health endpoint `/api/health`.

### Out of scope
- Online payment (pay on delivery only).
- Admin dashboard, stock management, delivery tracking.
- Email/password or other identity providers.

## 5. User flow

1. Land on the shop → products load.
2. Add items → cart drawer opens with totals.
3. Checkout → if signed out, Google sign-in → return to checkout with name/email prefilled.
4. Place order → order + items written → thank-you page → confirmation email.
5. "My orders" shows the order; log out, log in again, it is still there.

## 6. Data model

- `products(id, name, description, price kobo, emoji, category, in_stock, sort)`
- `orders(id uuid, user_id → auth.users, email, customer_name, address, total, status, email_sent, created_at)`
- `order_items(id, order_id → orders, product_id, name, unit_price, quantity)`

Prices are integers in kobo to avoid floating-point money.

## 7. Non-functional

- Works on a 390px phone with no horizontal scroll.
- No framework or build step; first load under ~150 KB including supabase-js.
- Secrets never shipped to the browser; only the publishable key is public.
- Tests: email rendering and the confirmation endpoint (auth, validation, Mailgun, RLS 404).

## 8. Success criteria

- A new Google user can complete an order on the live URL in under two minutes.
- The order appears in Supabase and in "My orders" after logout/login.
- A confirmation email is received (authorized recipient on the sandbox domain).

## 9. Risks

- **Mailgun sandbox** only sends to up to 5 authorized recipients. Mitigation: UI explains it; a
  custom domain lifts the limit later.
- **Google consent screen in Testing mode** only allows listed test users. Mitigation: publish
  the app, or add grader emails as test users.
