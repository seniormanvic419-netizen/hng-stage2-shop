// POST /api/send-confirmation  { orderId }
// Verifies the caller's Supabase session, loads the order *as that user* (RLS enforced),
// sends the confirmation through Mailgun, then marks the order email_sent.
import { isUuid, isValidEmail, renderHtml, renderSubject, renderText, type Order } from './_lib/email';

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  MAILGUN_API_KEY?: string;
  MAILGUN_DOMAIN?: string;
  MAILGUN_FROM?: string;
  MAILGUN_REGION?: string; // "eu" for api.eu.mailgun.net
  SHOP_NAME?: string;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return json({ sent: false, error: 'Sign in required' }, 401);

  let body: { orderId?: unknown };
  try { body = await request.json(); } catch { return json({ sent: false, error: 'Invalid JSON' }, 400); }
  if (!isUuid(body.orderId)) return json({ sent: false, error: 'orderId must be a UUID' }, 400);

  const sbHeaders = { apikey: env.SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${token}` };

  // 1. Who is calling? Supabase validates the JWT for us.
  const who = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers: sbHeaders });
  if (!who.ok) return json({ sent: false, error: 'Session invalid or expired' }, 401);
  const user = (await who.json()) as { id: string; email?: string };

  // 2. Load the order with the caller's token so RLS only returns their own orders.
  const q = new URL(`${env.SUPABASE_URL}/rest/v1/orders`);
  q.searchParams.set('id', `eq.${body.orderId}`);
  q.searchParams.set('select', 'id,email,customer_name,address,total,status,created_at,email_sent,order_items(name,unit_price,quantity)');
  const res = await fetch(q, { headers: { ...sbHeaders, Accept: 'application/json' } });
  if (!res.ok) return json({ sent: false, error: `Could not load order (${res.status})` }, 502);
  const rows = (await res.json()) as (Order & { email_sent: boolean })[];
  const order = rows[0];
  if (!order) return json({ sent: false, error: 'Order not found' }, 404);
  if (order.email_sent) return json({ sent: true, already: true });
  if (!isValidEmail(order.email)) return json({ sent: false, error: 'Order has no valid email' }, 422);

  const shopName = env.SHOP_NAME || 'Basira Provisions';

  // 3. Mailgun. Missing config is reported, not treated as a crash, so the shop still works.
  if (!env.MAILGUN_API_KEY || !env.MAILGUN_DOMAIN) return json({ sent: false, reason: 'not_configured' });
  const base = env.MAILGUN_REGION === 'eu' ? 'https://api.eu.mailgun.net' : 'https://api.mailgun.net';
  const form = new FormData();
  form.set('from', env.MAILGUN_FROM || `${shopName} <postmaster@${env.MAILGUN_DOMAIN}>`);
  form.set('to', order.customer_name ? `${order.customer_name} <${order.email}>` : order.email);
  form.set('subject', renderSubject(order, shopName));
  form.set('text', renderText(order, shopName));
  form.set('html', renderHtml(order, shopName));
  form.set('o:tag', 'order-confirmation');
  form.set('v:order_id', order.id);
  form.set('v:user_id', user.id);

  const mg = await fetch(`${base}/v3/${env.MAILGUN_DOMAIN}/messages`, {
    method: 'POST',
    headers: { Authorization: 'Basic ' + btoa(`api:${env.MAILGUN_API_KEY}`) },
    body: form,
  });
  const mgText = await mg.text();
  if (!mg.ok) {
    const notAuthorized = mg.status === 403 && /not allowed to send|authorized recipients/i.test(mgText);
    return json({ sent: false, reason: notAuthorized ? 'recipient_not_authorized' : 'mailgun_error', error: mgText.slice(0, 300), status: mg.status }, 502);
  }

  // 4. Record delivery on the order (user's own row, allowed by the update policy).
  await fetch(`${env.SUPABASE_URL}/rest/v1/orders?id=eq.${order.id}`, {
    method: 'PATCH',
    headers: { ...sbHeaders, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ email_sent: true }),
  }).catch(() => undefined);

  let mgId: string | undefined;
  try { mgId = (JSON.parse(mgText) as { id?: string }).id; } catch { /* ignore */ }
  return json({ sent: true, id: mgId });
};

export const onRequest: PagesFunction<Env> = async (ctx) => {
  if (ctx.request.method === 'POST') return onRequestPost(ctx);
  return json({ error: 'Method not allowed' }, 405);
};
