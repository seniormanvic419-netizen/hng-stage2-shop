import { describe, expect, it } from 'vitest';
import { escapeHtml, isUuid, isValidEmail, naira, renderHtml, renderSubject, renderText, shortId, type Order } from '../functions/api/_lib/email';

const order: Order = {
  id: '3f1c2a9b-7d4e-4e2b-9b1a-0c7d5e6f8a9b',
  email: 'buyer@example.com',
  customer_name: 'Bayode Manuel',
  address: '12 Isheri Road\nOjodu Berger, Lagos',
  total: 1_005_000,
  status: 'confirmed',
  created_at: '2026-10-02T10:00:00Z',
  order_items: [
    { name: 'Rice 5kg <Golden>', unit_price: 950_000, quantity: 1 },
    { name: 'Peak milk tin', unit_price: 55_000, quantity: 1 },
  ],
};

describe('money and ids', () => {
  it('formats kobo as naira', () => {
    expect(naira(950_000)).toBe('₦9,500');
    expect(naira(55_050)).toBe('₦550.50');
    expect(naira(0)).toBe('₦0');
  });
  it('shortens order ids', () => expect(shortId(order.id)).toBe('#3F1C2A9B'));
  it('validates uuids', () => {
    expect(isUuid(order.id)).toBe(true);
    expect(isUuid('not-a-uuid')).toBe(false);
    expect(isUuid(42)).toBe(false);
  });
  it('validates emails', () => {
    expect(isValidEmail('a@b.co')).toBe(true);
    expect(isValidEmail('nope')).toBe(false);
    expect(isValidEmail(null)).toBe(false);
  });
});

describe('email rendering', () => {
  it('builds a subject with shop name and short id', () => {
    expect(renderSubject(order, 'Basira Provisions')).toBe('Basira Provisions: order #3F1C2A9B confirmed');
  });
  it('lists items, total and address in the text version', () => {
    const t = renderText(order, 'Basira Provisions');
    expect(t).toContain('Hi Bayode,');
    expect(t).toContain('1 x Rice 5kg <Golden> — ₦9,500');
    expect(t).toContain('Total: ₦10,050');
    expect(t).toContain('Ojodu Berger, Lagos');
  });
  it('escapes HTML in the html version', () => {
    const h = renderHtml(order, 'Basira Provisions');
    expect(h).toContain('Rice 5kg &lt;Golden&gt;');
    expect(h).not.toContain('<Golden>');
    expect(h).toContain('12 Isheri Road<br>Ojodu Berger, Lagos');
    expect(h).toContain('₦10,050');
  });
  it('falls back politely when the name is missing', () => {
    const t = renderText({ ...order, customer_name: null }, 'Shop');
    expect(t.startsWith('Hi there,')).toBe(true);
  });
  it('escapeHtml covers the five specials', () => {
    expect(escapeHtml(`<a href="x">&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
  });
});
