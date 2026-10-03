/* Basira Provisions — storefront logic.
 * Plain browser JS. Supabase JS (UMD) is loaded from the CDN before this file.
 * Data: products / orders / order_items tables in Supabase, protected by RLS.
 * Auth: Supabase Auth with the Google provider (OAuth, PKCE flow).
 * Email: POST /api/send-confirmation (Cloudflare Pages Function → Mailgun).
 */
(function () {
  'use strict';

  var CFG = window.SHOP_CONFIG || {};
  var CART_KEY = 'basira.cart.v1';
  var INTENT_KEY = 'basira.intent';
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  if (!window.supabase || !CFG.supabaseUrl || !CFG.supabaseKey) {
    setStatus('#products-status', 'The shop could not start: Supabase client missing.', true);
    return;
  }
  var sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, {
    auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });

  var state = { user: null, session: null, products: [], category: 'all', cart: loadCart(), orders: null, view: 'shop', lastOrder: null };

  /* ---------- money ---------- */
  function naira(kobo) {
    var n = Math.round(kobo) / 100;
    return '₦' + n.toLocaleString('en-NG', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
  }

  /* ---------- cart (localStorage) ---------- */
  function loadCart() {
    try { var raw = localStorage.getItem(CART_KEY); var c = raw ? JSON.parse(raw) : {}; return (c && typeof c === 'object') ? c : {}; }
    catch (e) { return {}; }
  }
  function saveCart() { try { localStorage.setItem(CART_KEY, JSON.stringify(state.cart)); } catch (e) { /* ignore */ } }
  function cartLines() {
    return Object.keys(state.cart).map(function (id) {
      var p = state.products.find(function (x) { return x.id === id; });
      return p ? { product: p, qty: state.cart[id] } : null;
    }).filter(Boolean);
  }
  function cartTotal() { return cartLines().reduce(function (s, l) { return s + l.product.price * l.qty; }, 0); }
  function cartCount() { return Object.keys(state.cart).reduce(function (s, id) { return s + state.cart[id]; }, 0); }
  function setQty(id, qty) {
    if (qty <= 0) delete state.cart[id]; else state.cart[id] = Math.min(99, qty);
    saveCart(); renderCart(); renderCheckoutSummary();
  }
  function addToCart(id) {
    setQty(id, (state.cart[id] || 0) + 1);
    openDrawer();
  }

  /* ---------- views ---------- */
  function showView(name) {
    if (name === 'orders' && !state.user) { rememberIntent('orders'); return signIn(); }
    if (name === 'checkout') {
      if (!cartLines().length) { openDrawer(); return; }
      if (!state.user) { rememberIntent('checkout'); return signIn(); }
      renderCheckoutSummary();
      prefillCheckout();
    }
    state.view = name;
    $$('.view').forEach(function (v) { v.hidden = v.id !== 'view-' + name; });
    closeDrawer();
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
    if (name === 'orders') loadOrders();
    if (name === 'shop' && location.hash && location.hash !== '#products') history.replaceState(null, '', location.pathname);
  }
  function rememberIntent(v) { try { sessionStorage.setItem(INTENT_KEY, v); } catch (e) { /* ignore */ } }
  function takeIntent() { try { var v = sessionStorage.getItem(INTENT_KEY); sessionStorage.removeItem(INTENT_KEY); return v; } catch (e) { return null; } }

  document.addEventListener('click', function (ev) {
    var t = ev.target.closest('[data-view]');
    if (!t) return;
    ev.preventDefault();
    showView(t.getAttribute('data-view'));
  });

  /* ---------- auth ---------- */
  function signIn() {
    return sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: location.origin + location.pathname, queryParams: { access_type: 'online', prompt: 'select_account' } }
    }).then(function (res) { if (res.error) toast(res.error.message, true); });
  }
  function signOut() {
    sb.auth.signOut().then(function () { state.orders = null; showView('shop'); toast('You are logged out. Your orders are saved for next time.'); });
  }
  function renderAuth() {
    var u = state.user;
    $('#sign-in').hidden = !!u;
    $('#user').hidden = !u;
    $('#nav-orders').hidden = !u;
    $('#hero-orders').hidden = !u;
    if (u) {
      var meta = u.user_metadata || {};
      $('#user-name').textContent = meta.full_name || meta.name || u.email || 'Signed in';
      var av = $('#user-avatar');
      if (meta.avatar_url || meta.picture) { av.src = meta.avatar_url || meta.picture; av.hidden = false; } else { av.hidden = true; }
    }
    $('#cart-hint').textContent = u ? '' : 'You will sign in with Google at checkout.';
  }

  sb.auth.onAuthStateChange(function (event, session) {
    state.session = session;
    state.user = session ? session.user : null;
    renderAuth();
    if (event === 'SIGNED_IN') {
      var intent = takeIntent();
      if (intent) showView(intent);
    }
    if (event === 'SIGNED_OUT') { state.orders = null; }
  });

  /* ---------- products ---------- */
  function loadProducts() {
    return sb.from('products').select('*').eq('in_stock', true).order('sort', { ascending: true }).then(function (res) {
      if (res.error) { setStatus('#products-status', 'Could not load products: ' + res.error.message, true); return; }
      state.products = res.data || [];
      setStatus('#products-status', state.products.length ? '' : 'No products yet.');
      renderFilters(); renderProducts(); renderCart();
    });
  }
  function renderFilters() {
    var cats = ['all'].concat(state.products.map(function (p) { return p.category; }).filter(function (c, i, a) { return c && a.indexOf(c) === i; }));
    var wrap = $('#category-filters'); wrap.innerHTML = '';
    cats.forEach(function (c) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'chip' + (c === state.category ? ' is-active' : ''); b.textContent = c === 'all' ? 'All' : c;
      b.setAttribute('aria-pressed', c === state.category ? 'true' : 'false');
      b.addEventListener('click', function () { state.category = c; renderFilters(); renderProducts(); });
      wrap.appendChild(b);
    });
  }
  function renderProducts() {
    var grid = $('#product-grid'); var tpl = $('#product-template'); grid.innerHTML = '';
    state.products.filter(function (p) { return state.category === 'all' || p.category === state.category; }).forEach(function (p) {
      var node = tpl.content.firstElementChild.cloneNode(true);
      node.dataset.id = p.id;
      $('.card__emoji', node).textContent = p.emoji || '🛍️';
      var img = $('.card__img', node); var media = $('.card__media', node);
      img.alt = p.name;
      img.addEventListener('error', function () { img.classList.add('is-missing'); media.classList.add('no-img'); });
      img.src = p.image || ('img/' + p.id + '.jpg');
      $('.card__cat', node).textContent = p.category || '';
      $('.card__name', node).textContent = p.name;
      $('.card__desc', node).textContent = p.description || '';
      $('.card__price', node).textContent = naira(p.price);
      var btn = $('.card__add', node);
      btn.setAttribute('aria-label', 'Add ' + p.name + ' to cart');
      btn.addEventListener('click', function () { addToCart(p.id); btn.textContent = 'Added ✓'; setTimeout(function () { btn.textContent = 'Add to cart'; }, 900); });
      grid.appendChild(node);
    });
  }

  /* ---------- cart drawer ---------- */
  function lineNode(l, editable) {
    var li = document.createElement('li'); li.className = 'line';
    var em = document.createElement('span'); em.className = 'line__emoji'; em.textContent = l.product.emoji || '🛍️'; em.setAttribute('aria-hidden', 'true');
    var mid = document.createElement('div');
    var name = document.createElement('p'); name.className = 'line__name'; name.textContent = l.product.name;
    var meta = document.createElement('p'); meta.className = 'line__meta';
    mid.appendChild(name); mid.appendChild(meta);
    var right = document.createElement('div');
    var price = document.createElement('div'); price.className = 'line__price'; price.textContent = naira(l.product.price * l.qty);
    right.appendChild(price);
    if (editable) {
      var q = document.createElement('div'); q.className = 'qty';
      var minus = document.createElement('button'); minus.type = 'button'; minus.textContent = '−'; minus.setAttribute('aria-label', 'Decrease ' + l.product.name);
      var n = document.createElement('span'); n.textContent = l.qty;
      var plus = document.createElement('button'); plus.type = 'button'; plus.textContent = '+'; plus.setAttribute('aria-label', 'Increase ' + l.product.name);
      minus.addEventListener('click', function () { setQty(l.product.id, l.qty - 1); });
      plus.addEventListener('click', function () { setQty(l.product.id, l.qty + 1); });
      q.appendChild(minus); q.appendChild(n); q.appendChild(plus);
      meta.appendChild(q);
      var rm = document.createElement('button'); rm.type = 'button'; rm.className = 'line__remove'; rm.textContent = 'Remove';
      rm.addEventListener('click', function () { setQty(l.product.id, 0); });
      right.appendChild(rm);
    } else {
      meta.textContent = l.qty + ' × ' + naira(l.product.price);
    }
    li.appendChild(em); li.appendChild(mid); li.appendChild(right);
    return li;
  }
  function renderCart() {
    var lines = cartLines(); var ul = $('#cart-lines'); ul.innerHTML = '';
    lines.forEach(function (l) { ul.appendChild(lineNode(l, true)); });
    $('#cart-empty').hidden = lines.length > 0;
    $('#cart-total').textContent = naira(cartTotal());
    $('#cart-count').textContent = String(cartCount());
    $('#go-checkout').disabled = lines.length === 0;
    $('#cart-btn').setAttribute('aria-label', 'Open cart, ' + cartCount() + ' item' + (cartCount() === 1 ? '' : 's'));
  }
  function openDrawer() { $('#drawer').classList.add('is-open'); $('#drawer').setAttribute('aria-hidden', 'false'); $('#drawer-backdrop').hidden = false; }
  function closeDrawer() { $('#drawer').classList.remove('is-open'); $('#drawer').setAttribute('aria-hidden', 'true'); $('#drawer-backdrop').hidden = true; }
  $('#cart-btn').addEventListener('click', openDrawer);
  $('#cart-close').addEventListener('click', closeDrawer);
  $('#drawer-backdrop').addEventListener('click', closeDrawer);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDrawer(); });
  $('#go-checkout').addEventListener('click', function () { showView('checkout'); });

  /* ---------- checkout ---------- */
  function renderCheckoutSummary() {
    var ul = $('#checkout-lines'); if (!ul) return; ul.innerHTML = '';
    cartLines().forEach(function (l) { ul.appendChild(lineNode(l, false)); });
    $('#checkout-total').textContent = naira(cartTotal());
  }
  function prefillCheckout() {
    var u = state.user; if (!u) return;
    var meta = u.user_metadata || {};
    if (!$('#co-name').value) $('#co-name').value = meta.full_name || meta.name || '';
    if (!$('#co-email').value) $('#co-email').value = u.email || '';
  }
  $('#checkout-form').addEventListener('submit', function (ev) {
    ev.preventDefault();
    placeOrder();
  });

  function placeOrder() {
    var lines = cartLines();
    if (!lines.length) return showView('shop');
    if (!state.user) { rememberIntent('checkout'); return signIn(); }
    var btn = $('#place-order'); btn.disabled = true; btn.textContent = 'Placing order…';
    setStatus('#checkout-status', '');
    var name = $('#co-name').value.trim(); var email = $('#co-email').value.trim(); var address = $('#co-address').value.trim(); var phone = $('#co-phone').value.trim();
    var total = cartTotal();
    var order = { user_id: state.user.id, email: email, customer_name: name, address: address + (phone ? '\nPhone: ' + phone : ''), total: total, status: 'confirmed' };

    sb.from('orders').insert(order).select().single().then(function (res) {
      if (res.error) throw res.error;
      var created = res.data;
      var items = lines.map(function (l) { return { order_id: created.id, product_id: l.product.id, name: l.product.name, unit_price: l.product.price, quantity: l.qty }; });
      return sb.from('order_items').insert(items).then(function (r2) {
        if (r2.error) throw r2.error;
        created.order_items = items;
        return created;
      });
    }).then(function (created) {
      state.lastOrder = created;
      state.cart = {}; saveCart(); renderCart();
      state.orders = null;
      $('#thanks-text').textContent = 'Thanks, ' + (name.split(' ')[0] || 'friend') + '. Order ' + shortId(created.id) + ' for ' + naira(created.total) + ' is confirmed. We will deliver to the address you gave and collect payment at the door.';
      $('#thanks-email').textContent = 'Sending your confirmation email to ' + email + '…';
      showView('thanks');
      return sendConfirmation(created.id).then(function (r) {
        if (r && r.sent) $('#thanks-email').textContent = 'A confirmation email is on its way to ' + email + '.';
        else if (r && r.reason === 'not_configured') $('#thanks-email').textContent = 'Email sending is not configured on this deployment yet, but your order is saved.';
        else if (r && r.reason === 'recipient_not_authorized') $('#thanks-email').textContent = 'Your order is saved. The email could not be delivered because this address is not on the sandbox allow-list (Mailgun sandbox restriction).';
        else $('#thanks-email').textContent = 'Your order is saved. The confirmation email could not be sent' + (r && r.error ? ': ' + r.error : '.');
      });
    }).catch(function (err) {
      setStatus('#checkout-status', 'Could not place the order: ' + (err.message || err), true);
    }).then(function () { btn.disabled = false; btn.textContent = 'Place order'; });
  }

  function sendConfirmation(orderId) {
    return sb.auth.getSession().then(function (r) {
      var token = r.data && r.data.session ? r.data.session.access_token : null;
      if (!token) return { sent: false, error: 'no session' };
      return fetch('/api/send-confirmation', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ orderId: orderId })
      }).then(function (res) { return res.json().catch(function () { return { sent: false, error: 'HTTP ' + res.status }; }); });
    }).catch(function (e) { return { sent: false, error: e.message }; });
  }

  /* ---------- orders ---------- */
  function loadOrders() {
    if (!state.user) return;
    setStatus('#orders-status', state.orders ? '' : 'Loading your orders…');
    return sb.from('orders').select('*, order_items(*)').order('created_at', { ascending: false }).then(function (res) {
      if (res.error) { setStatus('#orders-status', 'Could not load orders: ' + res.error.message, true); return; }
      state.orders = res.data || [];
      setStatus('#orders-status', state.orders.length ? '' : 'No orders yet. Your first one will show here as soon as you place it.');
      renderOrders();
    });
  }
  function renderOrders() {
    var ul = $('#orders-list'); ul.innerHTML = '';
    (state.orders || []).forEach(function (o) {
      var li = document.createElement('li'); li.className = 'order';
      var head = document.createElement('div'); head.className = 'order__head';
      var id = document.createElement('p'); id.className = 'order__id'; id.textContent = 'Order ' + shortId(o.id);
      var date = document.createElement('p'); date.className = 'order__date'; date.textContent = new Date(o.created_at).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' });
      var badge = document.createElement('span'); badge.className = 'order__badge'; badge.textContent = o.status + (o.email_sent ? ' · email sent' : '');
      head.appendChild(id); head.appendChild(date); head.appendChild(badge);
      var items = document.createElement('ul'); items.className = 'order__items';
      (o.order_items || []).forEach(function (it) {
        var li2 = document.createElement('li'); li2.textContent = it.quantity + ' × ' + it.name + ' — ' + naira(it.unit_price * it.quantity); items.appendChild(li2);
      });
      var foot = document.createElement('div'); foot.className = 'order__foot';
      var addr = document.createElement('span'); addr.textContent = (o.address || '').split('\n')[0]; addr.style.fontWeight = '400'; addr.style.color = 'var(--text-2)';
      var tot = document.createElement('span'); tot.textContent = naira(o.total);
      foot.appendChild(addr); foot.appendChild(tot);
      li.appendChild(head); li.appendChild(items); li.appendChild(foot);
      ul.appendChild(li);
    });
  }

  /* ---------- helpers ---------- */
  function shortId(id) { return '#' + String(id).slice(0, 8).toUpperCase(); }
  function setStatus(sel, msg, isError) { var el = $(sel); if (!el) return; el.textContent = msg; el.classList.toggle('is-error', !!isError); el.hidden = !msg; }
  var toastTimer;
  function toast(msg, isError) {
    var el = $('#toast');
    if (!el) { el = document.createElement('div'); el.id = 'toast'; el.setAttribute('role', 'status'); el.style.cssText = 'position:fixed;left:50%;bottom:1.25rem;transform:translateX(-50%);background:#1a1c1a;color:#fff;padding:.7rem 1rem;border-radius:999px;font-size:.9rem;z-index:60;max-width:90vw;box-shadow:0 10px 30px rgba(0,0,0,.25)'; document.body.appendChild(el); }
    el.textContent = msg; el.style.background = isError ? '#b4232c' : '#1a1c1a'; el.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { el.hidden = true; }, 3500);
  }

  $('#sign-in').addEventListener('click', signIn);
  $('#sign-out').addEventListener('click', signOut);
  $('#year').textContent = String(new Date().getFullYear());

  /* ---------- boot ---------- */
  renderAuth();
  loadProducts();
  sb.auth.getSession().then(function (r) {
    state.session = r.data.session; state.user = r.data.session ? r.data.session.user : null; renderAuth();
    if (location.hash === '#orders' && state.user) showView('orders');
  });
  if (location.search.indexOf('error=') > -1) {
    var p = new URLSearchParams(location.search);
    toast('Sign-in failed: ' + (p.get('error_description') || p.get('error')), true);
    history.replaceState(null, '', location.pathname);
  }
})();
