// Pure helpers for the confirmation email. No I/O here so they can be unit-tested.

export interface OrderItem { name: string; unit_price: number; quantity: number }
export interface Order {
  id: string; email: string; customer_name: string | null; address: string | null;
  total: number; status: string; created_at: string; order_items?: OrderItem[];
}

export function naira(kobo: number): string {
  const n = Math.round(kobo) / 100;
  const s = n.toLocaleString('en-NG', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
  return `₦${s}`;
}

export function shortId(id: string): string {
  return `#${String(id).slice(0, 8).toUpperCase()}`;
}

export function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

export function isValidEmail(s: unknown): s is string {
  return typeof s === 'string' && s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export function isUuid(s: unknown): s is string {
  return typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

export function renderSubject(order: Order, shopName: string): string {
  return `${shopName}: order ${shortId(order.id)} confirmed`;
}

export function renderText(order: Order, shopName: string): string {
  const items = (order.order_items || []).map((i) => `  ${i.quantity} x ${i.name} — ${naira(i.unit_price * i.quantity)}`).join('\n');
  const first = (order.customer_name || '').trim().split(/\s+/)[0] || 'there';
  return [
    `Hi ${first},`,
    '',
    `Thanks for your order from ${shopName}. It is confirmed and we are packing it now.`,
    '',
    `Order ${shortId(order.id)}`,
    `Placed: ${new Date(order.created_at).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' })}`,
    '',
    'Items:',
    items,
    '',
    `Total: ${naira(order.total)} (pay on delivery)`,
    '',
    'Deliver to:',
    order.address || '(no address given)',
    '',
    `— ${shopName}`,
  ].join('\n');
}

export function renderHtml(order: Order, shopName: string): string {
  const rows = (order.order_items || []).map((i) =>
    `<tr><td style="padding:8px 0;border-bottom:1px solid #eee">${escapeHtml(i.name)} <span style="color:#777">× ${i.quantity}</span></td>` +
    `<td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;white-space:nowrap">${naira(i.unit_price * i.quantity)}</td></tr>`).join('');
  const first = escapeHtml((order.customer_name || '').trim().split(/\s+/)[0] || 'there');
  const address = escapeHtml(order.address || '(no address given)').replace(/\n/g, '<br>');
  return `<!doctype html><html><body style="margin:0;background:#f7f6f2;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1c1a">
<div style="max-width:560px;margin:0 auto;padding:24px">
  <div style="background:#1b5e3b;color:#fff;border-radius:14px 14px 0 0;padding:20px 24px;font-weight:700;font-size:18px">${escapeHtml(shopName)}</div>
  <div style="background:#fff;border:1px solid #e4e2da;border-top:0;border-radius:0 0 14px 14px;padding:24px">
    <h1 style="margin:0 0 8px;font-size:22px">Order ${shortId(order.id)} confirmed</h1>
    <p style="margin:0 0 20px;color:#585c57">Hi ${first}, thanks for shopping with us. We are packing your order now and will collect payment at the door.</p>
    <table style="width:100%;border-collapse:collapse;font-size:15px">${rows}
      <tr><td style="padding:12px 0;font-weight:700">Total</td><td style="padding:12px 0;text-align:right;font-weight:700">${naira(order.total)}</td></tr>
    </table>
    <p style="margin:20px 0 0;font-size:14px;color:#585c57"><strong style="color:#1a1c1a">Deliver to</strong><br>${address}</p>
    <p style="margin:24px 0 0;font-size:12px;color:#8a8e88">Placed ${escapeHtml(new Date(order.created_at).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' }))}. Reply to this email if anything looks wrong.</p>
  </div>
</div></body></html>`;
}
