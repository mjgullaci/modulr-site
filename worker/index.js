// Modulr site worker: serves the static site + one secure Square payment endpoint.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/api/pay') {
      return handlePay(request, env);
    }
    return env.ASSETS.fetch(request);
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
    const { sourceId, amount, currency, note } = await request.json();
    if (!sourceId || !amount) return json({ ok: false, error: 'Missing payment details' }, 400);

    const token = env.SQUARE_ACCESS_TOKEN;
    if (!token) return json({ ok: false, error: 'Checkout is not switched on yet' }, 503);

    const base = env.SQUARE_ENV === 'production'
      ? 'https://connect.squareup.com'
      : 'https://connect.squareupsandbox.com';

    const resp = await fetch(base + '/v2/payments', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        source_id: sourceId,
        idempotency_key: crypto.randomUUID(),
        amount_money: { amount: Math.round(amount), currency: currency || 'AUD' },
        location_id: env.SQUARE_LOCATION_ID || '',
        note: note ? ('Modulr: ' + note).slice(0, 190) : 'Modulr'
      })
    });

    const data = await resp.json();
    if (!resp.ok) {
      const msg = data && data.errors && data.errors[0] ? data.errors[0].detail : 'Payment failed';
      return json({ ok: false, error: msg }, 400);
    }
    return json({ ok: true, id: data.payment && data.payment.id });
  } catch (e) {
    return json({ ok: false, error: 'Server error, please try again' }, 500);
  }
}
