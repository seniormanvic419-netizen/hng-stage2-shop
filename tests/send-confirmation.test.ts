import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onRequest, type Env } from '../functions/api/send-confirmation';

const env: Env = {
  SUPABASE_URL: 'https://proj.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
  MAILGUN_API_KEY: 'key-test',
  MAILGUN_DOMAIN: 'sandbox123.mailgun.org',
  SHOP_NAME: 'Basira Provisions',
};
const ORDER_ID = '3f1c2a9b-7d4e-4e2b-9b1a-0c7d5e6f8a9b';
const orderRow = {
  id: ORDER_ID, email: 'buyer@example.com', customer_name: 'Bayode Manuel', address: 'Lagos', total: 950000,
  status: 'confirmed', created_at: '2026-10-02T10:00:00Z', email_sent: false,
  order_items: [{ name: 'Rice 5kg', unit_price: 950000, quantity: 1 }],
};

function call(body: unknown, token = 'good-token', e: Env = env, method = 'POST') {
  const req = new Request('https://shop.test/api/send-confirmation', {
    method, headers: token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : {},
    body: method === 'POST' ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
  });
  // Only request + env are used by the handler.
  return onRequest({ request: req, env: e } as unknown as Parameters<typeof onRequest>[0]);
}

let calls: { url: string; init?: RequestInit }[];
beforeEach(() => {
  calls = [];
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    calls.push({ url, init });
    if (url.endsWith('/auth/v1/user')) {
      const ok = (init?.headers as Record<string, string>)?.Authorization === 'Bearer good-token';
      return new Response(ok ? JSON.stringify({ id: 'user-1', email: 'buyer@example.com' }) : '{}', { status: ok ? 200 : 401 });
    }
    if (url.includes('/rest/v1/orders') && (!init || !init.method)) {
      return new Response(JSON.stringify(url.includes(ORDER_ID) ? [orderRow] : []), { status: 200 });
    }
    if (url.includes('/rest/v1/orders') && init?.method === 'PATCH') return new Response(null, { status: 204 });
    if (url.includes('mailgun.net')) {
      if ((env as Env & { __fail?: string }).__fail === 'sandbox') {
        return new Response("Forbidden: Domain sandbox123.mailgun.org is not allowed to send: Sandbox subdomains are for test purposes only. Please add your own domain or add the address to authorized recipients", { status: 403 });
      }
      return new Response(JSON.stringify({ id: '<msg@mailgun>', message: 'Queued. Thank you.' }), { status: 200 });
    }
    return new Response('unexpected ' + url, { status: 500 });
  }));
});
afterEach(() => { vi.unstubAllGlobals(); delete (env as Env & { __fail?: string }).__fail; });

describe('POST /api/send-confirmation', () => {
  it('rejects requests without a bearer token', async () => {
    const res = await call({ orderId: ORDER_ID }, '');
    expect(res.status).toBe(401);
  });
  it('rejects a bad token', async () => {
    const res = await call({ orderId: ORDER_ID }, 'bad-token');
    expect(res.status).toBe(401);
  });
  it('rejects malformed JSON and non-uuid ids', async () => {
    expect((await call('{nope')).status).toBe(400);
    expect((await call({ orderId: '1' })).status).toBe(400);
  });
  it('404s when RLS hides the order', async () => {
    const res = await call({ orderId: '00000000-0000-4000-8000-000000000000' });
    expect(res.status).toBe(404);
  });
  it('sends through Mailgun with the user token and marks email_sent', async () => {
    const res = await call({ orderId: ORDER_ID });
    expect(res.status).toBe(200);
    const body = await res.json() as { sent: boolean; id?: string };
    expect(body.sent).toBe(true);
    expect(body.id).toBe('<msg@mailgun>');
    const mg = calls.find((c) => c.url.includes('mailgun.net'))!;
    expect(mg.url).toBe('https://api.mailgun.net/v3/sandbox123.mailgun.org/messages');
    expect((mg.init!.headers as Record<string, string>).Authorization).toBe('Basic ' + btoa('api:key-test'));
    const form = mg.init!.body as FormData;
    expect(form.get('to')).toBe('Bayode Manuel <buyer@example.com>');
    expect(String(form.get('subject'))).toContain('#3F1C2A9B');
    const patch = calls.find((c) => c.init?.method === 'PATCH')!;
    expect(patch.url).toContain(`id=eq.${ORDER_ID}`);
    expect((patch.init!.headers as Record<string, string>).Authorization).toBe('Bearer good-token');
  });
  it('reports not_configured when Mailgun env is missing', async () => {
    const res = await call({ orderId: ORDER_ID }, 'good-token', { ...env, MAILGUN_API_KEY: undefined, MAILGUN_DOMAIN: undefined });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sent: false, reason: 'not_configured' });
  });
  it('maps the sandbox recipient error', async () => {
    (env as Env & { __fail?: string }).__fail = 'sandbox';
    const res = await call({ orderId: ORDER_ID });
    expect(res.status).toBe(502);
    expect((await res.json() as { reason: string }).reason).toBe('recipient_not_authorized');
  });
  it('rejects non-POST methods', async () => {
    const res = await call(null, 'good-token', env, 'GET');
    expect(res.status).toBe(405);
  });
});
