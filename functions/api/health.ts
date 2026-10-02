import type { Env } from './send-confirmation';

export const onRequestGet: PagesFunction<Env> = async ({ env }) =>
  new Response(JSON.stringify({
    ok: true,
    supabase: Boolean(env.SUPABASE_URL && env.SUPABASE_PUBLISHABLE_KEY),
    mailgun: Boolean(env.MAILGUN_API_KEY && env.MAILGUN_DOMAIN),
    time: new Date().toISOString(),
  }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
