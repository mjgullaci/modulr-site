// Modulr site worker: serves the static site + one secure Square payment endpoint.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/api/pay') {
      return handlePay(request, env);
    }
    // Serve static assets; tell browsers not to hard-cache HTML so edits show up immediately.
    const res = await env.ASSETS.fetch(request);
    try {
      const ct = res.headers.get('content-type') || '';
      if (ct.indexOf('text/html') !== -1) {
        const h = new Headers(res.headers);
        h.set('Cache-Control', 'no-cache');
        return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
      }
    } catch (e) {}
    return res;
  }
};

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

async function handlePay(request, env) {
  try {
    const { sourceId, amount, currency, note, buyerEmail } = await request.json();
    if (!sourceId || !amount) return json({ ok: false, error: 'Missing payment details' }, 400);

    const token = env.SQUARE_ACCESS_TOKEN;
    if (!token) return json({ ok: false, error: 'Checkout is not switched on yet' }, 503);

    const base = env.SQUARE_ENV === 'production'
      ? 'https://connect.squareup.com'
      : 'https://connect.squareupsandbox.com';
    const locationId = env.SQUARE_LOCATION_ID || '';

    // Use the location's own currency so amount_money always matches (sandbox + production).
    let payCurrency = currency || 'AUD';
    try {
      const locResp = await fetch(base + '/v2/locations/' + locationId, {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      const locData = await locResp.json();
      if (locData && locData.location && locData.location.currency) payCurrency = locData.location.currency;
    } catch (e) {}

    const body = {
      source_id: sourceId,
      idempotency_key: crypto.randomUUID(),
      amount_money: { amount: Math.round(amount), currency: payCurrency },
      location_id: locationId,
      note: note ? String(note).slice(0, 480) : 'Modulr'
    };
    if (buyerEmail && String(buyerEmail).indexOf('@') > 0) body.buyer_email_address = String(buyerEmail).slice(0, 254);

    const resp = await fetch(base + '/v2/payments', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const data = await resp.json();
    if (!resp.ok) {
      const msg = data && data.errors && data.errors[0] ? (data.errors[0].detail || data.errors[0].code) : 'Payment failed';
      return json({ ok: false, error: msg }, 400);
    }
    return json({ ok: true, id: data.payment && data.payment.id });
  } catch (e) {
    return json({ ok: false, error: 'Server error, please try again' }, 500);
  }
}
